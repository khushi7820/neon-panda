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

    const normalizedText = userText.toLowerCase().trim();
    const isGreeting = /^(hi|hello|hey|hiii|hey|namaste|hola)$/i.test(normalizedText);

    if (isGreeting) {
      console.log("👋 Simple greeting detected, sending standard reply (Saving Tokens)");
      const greetingMsg = "Hey! Welcome to Neon Panda 🐼 Would you like to explore our exciting Games or check out our Food Menu?";
      // auth_token and origin are already defined above
      await sendWhatsAppMessage(fromNumber, greetingMsg, auth_token!, origin!);
      return { success: true };
    }

    /* 5️⃣ RAG */
    const embedding = await embedText(userText);
    if (!embedding) {
      return { success: false, error: "Embedding failed" };
    }

    const matches = await retrieveRelevantChunksFromFiles(
      embedding,
      fileIds,
      6
    );

    const contextText = matches.map((m) => m.chunk).join("\n\n");

    /* 6️⃣ SYSTEM PROMPT & DAY LOGIC */
    const currentDay = new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      timeZone: 'Asia/Kolkata'
    }).format(new Date());

    const dayOfferMap: Record<string, string> = {
      'Monday': 'Panda Kickstart: Arcade @ ₹199 🕹️',
      'Tuesday': 'Turbo Tuesday: VR Experience @ ₹249 🥽',
      'Wednesday': 'Midweek Madness: Bowling Session @ ₹249 🎳',
      'Thursday': 'Throwdown Thursday: Multiplayer Games @ ₹199 🎮',
      'Friday': 'Panda Face-Off: Live Game Night @ ₹199 🏁',
      'Saturday': 'Super Saturday: Check combo pricing! 🥳',
      'Sunday': 'Family (₹999) | Friends (₹1,499) | Celebration (₹1,999) 📅'
    };

    const todaysOffer = dayOfferMap[currentDay] || "Panda Specials available!";

    const isMenuQuery = /\b(menu|food|khana|available|batao|dikhao|list|give|show)\b/i.test(userText) && !/\b(ha|yes|ok|confirm|order|book)\b/i.test(userText);

    const systemPrompt = `
${system_prompt || "You are a helpful WhatsApp assistant for Neon Panda."}

🎯 SYSTEM BEHAVIOR:
- Style: Hinglish (Hindi-English mix).
- Tone: Short WhatsApp-style replies, friendly and helpful.
- ⚠️ NEVER ask the user "what day is it today?". Use the provided Day Truth instead.

⚠️ ABSOLUTE DAY TRUTH (AUTO-APPLIED):
- TODAY IS: ${currentDay}. 
- TODAY'S OFFER: ${todaysOffer}.
- If user lies about day: "Nahi, aaj toh ${currentDay} hai 😊"

🎯 4-STEP BOOKING FLOW:
- Step 1: Decide Activity (Auto-apply today's offer).
- Step 2: Share Details (Number of players + Preferred time).
- Step 3: Check & Confirm Slot (Suggest alternatives if slot full).
- Step 4: Confirm Booking (Ask for Name + Contact number).

⚠️ NO PRODUCT/PRICE HALLUCINATION:
- ❌ NEVER invent prices for individual games (TRAMPOLINE, BOWLING, etc).
- ✅ ALWAYS refer to the PDF MENU for all prices (except Authorized Packages): https://drive.google.com/file/d/1aYTS0y8R6duSAurdJ6qiH_jv7KF3kuS4/preview

⚠️ CLEAN LIST FORMAT (STRICT):
- List items as: "1. Item Name - ₹Price".
- ❌ NO descriptions or fluff. Keep it extremely clean.

⚠️ AUTHORIZED PACKAGES ONLY:
- 1. Silver (₹499) | 2. Gold (₹699) | 3. Diamond (₹999).

💬 COMMON QUERIES (SHORT ANSWERS):
- Walk-in allowed? → Yes, slots subject to availability.
- Group booking minimum? → 4+ for best deals.
- Offers change weekly? → Structure stays same, events may change.
- Birthday booking? → Yes, Sunday is ideal.

🚫 STRICT RESTRICTIONS (WHAT AI MUST NOT DO):
- ❌ NEVER ask about today's day.
- ❌ NEVER create fake urgency or include hidden conditions.
- ❌ NEVER share other users' data.
- If user asks for sensitive info: "Sorry 🙏 This information cannot be shared. But I can fully help you with offers and booking 😊"

⚠️ OUTPUT STRUCTURE:
- Use "---SPLIT---" to separate bubbles (e.g. Intro ---SPLIT--- Details).
- ❌ No stars (*). ❌ No headings (#).
`;

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
        ...history.slice(-18),
        { role: "user", content: userText },
      ],
    });

    let response = completion.choices[0]?.message?.content;
    if (!response) {
      return { success: false, error: "Empty AI response" };
    }

    // FINAL FORMATTING FILTER (STRICT NO STARS)
    response = response.replace(/\*/g, "");
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
            auth_token!,
            origin!
          );
          lastSendResult = send;
        } catch (audioErr) {
          console.error("Audio processing failed, falling back to text:", audioErr);
          const send = await sendWhatsAppMessage(
            fromNumber,
            bubble,
            auth_token!,
            origin!
          );
          lastSendResult = send;
        }
      } else {
        // Normal Text Message
        const send = await sendWhatsAppMessage(
          fromNumber,
          bubble,
          auth_token!,
          origin!
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
