import { supabase } from "./supabaseClient";
import { embedText } from "./embeddings";
import { retrieveRelevantChunksFromFiles } from "./retrieval";
import { getFilesForPhoneNumber } from "./phoneMapping";
import { sendWhatsAppMessage, sendWhatsAppAudio } from "./whatsappSender";
import { speechToText } from "./speechToText";
import { textToSpeech } from "./edgeTts";
import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY!,
});

export type AutoResponseResult = {
  success: boolean;
  response?: string;
  error?: string;
  noDocuments?: boolean;
  sent?: boolean;
};

/* ---------------- LANGUAGE DETECTION ---------------- */
async function detectLanguage(text: string): Promise<string> {
  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "Detect the language. Reply ONLY with language name like English, Hindi, Gujarati.",
        },
        { role: "user", content: text },
      ],
    });

    return completion.choices[0]?.message?.content?.toLowerCase() || "english";
  } catch {
    return "english";
  }
}

/* ---------------- FORMAT RESPONSE ---------------- */
function formatWhatsAppResponse(text: string): string {
  return text.replace(/\n{3,}/g, "\n\n").trim().slice(0, 4000);
}

/* ---------------- MAIN AUTO RESPONDER ---------------- */
export async function generateAutoResponse(
  fromNumber: string,
  toNumber: string,
  messageText: string | null,
  messageId: string,
  mediaUrl?: string
): Promise<AutoResponseResult> {
  try {
    /* 1️⃣ FILE MAPPING */
    const fileIds = await getFilesForPhoneNumber(toNumber);

    if (fileIds.length === 0) {
      return {
        success: false,
        noDocuments: true,
        error: "No data configured",
      };
    }

    /* 2️⃣ PHONE CONFIG */
    const { data: phoneMappings } = await supabase
      .from("phone_document_mapping")
      .select("system_prompt, auth_token, origin")
      .eq("phone_number", toNumber)
      .limit(1);

    if (!phoneMappings?.length) {
      return { success: false, error: "Phone configuration missing" };
    }

    const { system_prompt, auth_token, origin } = phoneMappings[0];

    if (!auth_token || !origin) {
      return { success: false, error: "WhatsApp credentials missing" };
    }

    /* 3️⃣ INPUT NORMALIZATION */
    let userText = messageText?.trim() || "";
    let language = "english";
    // Check if it's a voice request (either directly from mediaUrl or already transcribed)
    const isVoiceRequest = !!mediaUrl;

    if (!userText && mediaUrl) {
      const transcript = await speechToText(mediaUrl);
      if (!transcript?.text) {
        return { success: false, error: "Voice transcription failed" };
      }
      userText = transcript.text.trim();
      language = transcript.language || (await detectLanguage(userText));
    }

    if (userText) {
      // Always detect language if not already set
      if (language === "english" || language === "unknown") {
        language = await detectLanguage(userText);
      }
    }

    if (!userText) {
      return { success: false, error: "Empty message" };
    }

    /* 4️⃣ CHAT HISTORY */
    const { data: historyRows } = await supabase
      .from("whatsapp_messages")
      .select("content_text, event_type")
      .or(`from_number.eq.${fromNumber},to_number.eq.${fromNumber}`)
      .order("received_at", { ascending: true })
      .limit(20);

    const history: { role: "user" | "assistant"; content: string }[] = (
      historyRows || []
    )
      .filter((m) => m.content_text)
      .map((m) => ({
        role: m.event_type === "MoMessage" ? "user" : "assistant",
        content: m.content_text as string,
      }));

    /* 5️⃣ RAG */
    const embedding = await embedText(userText);
    if (!embedding) {
      return { success: false, error: "Embedding failed" };
    }

    const matches = await retrieveRelevantChunksFromFiles(
      embedding,
      fileIds,
      7
    );

    const contextText = matches.map((m) => m.chunk).join("\n\n");

    /* 6️⃣ SYSTEM PROMPT */
    const currentDay = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(new Date());
    const isReturningUser = history.length > 0;

    const systemPrompt = `
${system_prompt || "You are a helpful WhatsApp assistant."}

USER STATUS: ${isReturningUser ? "RETURNING USER" : "NEW USER"}

⚠️ DAY RULE (CRITICAL - ALWAYS FOLLOW):
TODAY IS: ${currentDay}. This is the real system date. LOCKED.
- AI ko current day internally pata hona chahiye.
- User ko kabhi mat pucho: "aaj kaunsa day hai?"
- Agar user day bole → override karo.
- Only mention the day when user asks about offers, day, or schedule.
- If user asks about offers/day and claims a DIFFERENT day → say "Nahi, aaj ${currentDay} hai 😊" then give ${currentDay}'s offer.
- If user sends greetings like "hey", "hi", "hello" → reply with the standard welcome message ONLY. Do NOT mention the day.
- NEVER say the day or give an offer correction for a simple greeting.

RULES (STRICT PRIORITY):
- ❌ NEVER use * (stars) for bolding. If you use a *, you have FAILED.
- ❌ Do NOT start messages with "Aaj [Day] hai" unless asked or correcting.
- IF user asks for a specific day's offer → provide that directly. Do NOT talk about today.
- ONLY correct the day if the user misidentifies today's date.
- ❌ NEVER use # headings.
- ✅ Use plenty of relevant emojis for a premium feel 🐼🎳🍔🕹️.
- Short, friendly, human-like, clear replies only.
- ✅ Use • for clean bullets.
- 💬 Split multi-bubble messages using "---SPLIT---" marker (Max 2–3 bubbles).
- 📜 List Handling: Max 4–5 items per message.
- 🌐 LANGUAGE: Mirror same language (Hinglish, Hindi, English).
- Reply in ${language}.

CONTEXT:
${contextText || ""}
`;

    /* 7️⃣ LLM */
    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      temperature: 0.1,
      max_tokens: 1024,
      messages: [
        { role: "system", content: systemPrompt },
        ...history.slice(-3),
        { role: "user", content: userText },
      ],
    });

    let response = completion.choices[0]?.message?.content;
    if (!response) {
      return { success: false, error: "Empty AI response" };
    }

    response = formatWhatsAppResponse(response);

    /* 8️⃣ SEND RESPONSE (Text or Audio) */
    const responseBubbles = response.split("---SPLIT---").map(b => b.trim()).filter(Boolean);
    let lastSendResult: { success: boolean; error?: string } = { success: false, error: "No messages sent" };
    let finalResponseUrl = "";

    for (let i = 0; i < responseBubbles.length; i++) {
      const bubble = responseBubbles[i];
      
      if (isVoiceRequest) {
        try {
          // Convert to Speech
          const audioBuffer = await textToSpeech(bubble, language);

          // Upload to Supabase Storage
          const fileName = `v_${Date.now()}_${i}.mp3`;
          const { error: uploadError } = await supabase.storage
            .from("voice_replies")
            .upload(fileName, audioBuffer, {
              contentType: "audio/mpeg",
              upsert: true,
            });

          if (uploadError) throw uploadError;

          // Get Public URL
          const { data: { publicUrl } } = supabase.storage
            .from("voice_replies")
            .getPublicUrl(fileName);

          finalResponseUrl = publicUrl;

          // Send Audio
          const send = await sendWhatsAppAudio(
            fromNumber,
            finalResponseUrl,
            auth_token,
            origin
          );
          lastSendResult = send;
        } catch (audioErr) {
          console.error("Audio processing failed, falling back to text:", audioErr);
          const send = await sendWhatsAppMessage(
            fromNumber,
            bubble,
            auth_token,
            origin
          );
          lastSendResult = send;
        }
      } else {
        // Normal Text Message
        const send = await sendWhatsAppMessage(
          fromNumber,
          bubble,
          auth_token,
          origin
        );
        lastSendResult = send;
      }

      // Small delay between bubbles to preserve order
      if (responseBubbles.length > 1 && i < responseBubbles.length - 1) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    if (!lastSendResult.success) {
      return { success: false, error: lastSendResult.error };
    }

    /* 9️⃣ SAVE RESPONSE */
    await supabase.from("whatsapp_messages").insert([
      {
        message_id: `auto_${messageId}_${Date.now()}`,
        channel: "whatsapp",
        from_number: toNumber,
        to_number: fromNumber,
        received_at: new Date().toISOString(),
        content_type: isVoiceRequest && finalResponseUrl ? "audio" : "text",
        content_text: response,
        raw_payload: { audio_url: finalResponseUrl }, // Optional tracking
        sender_name: "AI Assistant",
        event_type: "MtMessage",
        is_in_24_window: true,
      },
    ]);

    return { success: true, response, sent: true };
  } catch (err) {
    console.error("AUTO RESPONDER ERROR:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
