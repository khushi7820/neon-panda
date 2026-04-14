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
      model: "llama-3.3-70b-versatile",
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
  return text
    .replace(/[*_#~]/g, "") // Remove common markdown symbols
    .replace(/\n{3,}/g, "\n\n") // Max double newline
    .trim()
    .slice(0, 900);
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
      2
    );

    const contextText = matches.map((m) => m.chunk).join("\n\n");

    /* 6️⃣ SYSTEM PROMPT */
    const currentDay = new Date().toLocaleDateString('en-US', { weekday: 'long' });
    const systemPrompt = `
${system_prompt || "You are a helpful WhatsApp assistant."}

CURRENT DAY: ${currentDay}

CONTEXT:
${contextText || ""}
`;

    /* 7️⃣ LLM */
    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      temperature: 0.3,
      max_tokens: 500,
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
    let send: { success: boolean, error?: string } = { success: true };
    let finalResponseUrl = "";

    if (isVoiceRequest) {
      try {
        // Convert to Speech
        const audioBuffer = await textToSpeech(response, language);

        // Upload to Supabase Storage
        const fileName = `v_${Date.now()}.mp3`;
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
        send = await sendWhatsAppAudio(
          fromNumber,
          finalResponseUrl,
          auth_token,
          origin
        );
      } catch (audioErr) {
        console.error("Audio processing failed, falling back to text:", audioErr);
        send = await sendWhatsAppMessage(
          fromNumber,
          response,
          auth_token,
          origin
        );
      }
    } else {
      // Normal Text Message - Support Splitting into 2 bubbles
      const bubbles = response.split("\n\n").filter(b => b.trim().length > 0).slice(0, 2);
      
      for (const bubble of bubbles) {
        const bubbleResult = await sendWhatsAppMessage(
          fromNumber,
          bubble,
          auth_token,
          origin
        );
        if (!bubbleResult.success) {
          send = bubbleResult;
          break;
        }
        
        // Small delay between bubbles for natural feel
        if (bubbles.length > 1 && bubbles.indexOf(bubble) === 0) {
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    }

    if (!send.success) {
      return { success: false, error: send.error };
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
