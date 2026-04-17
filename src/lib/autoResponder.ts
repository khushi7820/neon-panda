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
    /* 1️⃣ NUMBER VALIDATION & FILE MAPPING */
    if (toNumber !== '15558459146') {
      console.log(`🚫 Auto-responder disabled for number: ${toNumber}`);
      return { success: false, error: "Auto-responder only active for 15558459146" };
    }
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

    /* 4️⃣ CHAT HISTORY & GREETING */
    const { data: historyRows } = await supabase
      .from("whatsapp_messages")
      .select("content_text, event_type")
      .or(`from_number.eq.${fromNumber},to_number.eq.${fromNumber}`)
      .order("received_at", { ascending: true })
      .limit(15); // Increased history to 15 for better memory

    const history: { role: "user" | "assistant"; content: string }[] = (
      historyRows || []
    )
      .filter((m) => m.content_text)
      .map((m) => ({
        role: m.event_type === "MoMessage" ? "user" : "assistant",
        content: m.content_text as string,
      }));

    const normalizedText = userText.toLowerCase().trim();
    const isGreeting = /^(hi|hello|hey|hiii|namaste|hola|helo|hlo|start|start bot)$/i.test(normalizedText);

    if (isGreeting) {
      const currentDay = new Intl.DateTimeFormat('en-US', {
        weekday: 'long',
        timeZone: 'Asia/Kolkata'
      }).format(new Date());

      const dayOfferMap: Record<string, string> = {
        'Monday': 'Panda Kickstart: Arcade + Indoor Games @ ₹199 🎮',
        'Tuesday': 'Turbo Tuesday: VR Experience @ ₹249 🕶',
        'Wednesday': 'Midweek Madness: Bowling @ ₹249/person 🎳',
        'Thursday': 'Throwdown Thursday: Multiplayer Games @ ₹199 🎮',
        'Friday': 'Panda Face-Off: Live Game Night @ ₹199 🔥',
        'Saturday': 'Super Saturday: Combo & Group Pricing 🎉',
        'Sunday': 'Family Pack (4 ppl) ₹999 | Friends (6 ppl) ₹1,499 | Celebration (8 ppl) ₹1,999'
      };

      const todaysOffer = dayOfferMap[currentDay] || "Panda Specials available!";
      const greetingMsg = `Hey! Welcome to Neon Panda 🐼\nAaj ${currentDay} hai, aur aaj ka special: ${todaysOffer}\nGames explore karna hai ya Food menu dekhna hai? 😊`;
      
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
      3 // Reduced context to save payload space
    );

    const contextText = matches.map((m) => m.chunk).join("\n\n");

    /* 6️⃣ SYSTEM PROMPT & DAY LOGIC */
    const currentDay = new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      timeZone: 'Asia/Kolkata'
    }).format(new Date());

    const dayOfferMap: Record<string, string> = {
      'Monday': 'Panda Kickstart: Arcade + Indoor Games @ ₹199 🎮',
      'Tuesday': 'Turbo Tuesday: VR Experience @ ₹249 🕶',
      'Wednesday': 'Midweek Madness: Bowling @ ₹249/person 🎳',
      'Thursday': 'Throwdown Thursday: Multiplayer Games @ ₹199 🎮',
      'Friday': 'Panda Face-Off: Live Game Night @ ₹199 🔥',
      'Saturday': 'Super Saturday: Combo & Group Pricing 🎉',
      'Sunday': 'Family Pack (4 ppl) ₹999 | Friends (6 ppl) ₹1,499 | Celebration (8 ppl) ₹1,999'
    };
    const todaysOffer = dayOfferMap[currentDay] || "Panda Specials available!";

    const systemPrompt = `
You are "Panda Bot" 🐼 — friendly WhatsApp assistant for Neon Panda (Indore).

${system_prompt || ""}

STYLE:
- Hinglish (Hindi + English). Short replies (max 25 words).
- Friendly tone, no long paragraphs.

DAY & OFFER:
ACTUAL TODAY: ${currentDay}
TODAY'S OFFER: ${todaysOffer}
Weekly Offers: Mon-Arcade(199), Tue-VR(249), Wed-Bowling(249), Thu-Multi(199), Fri-Live(199), Sat-Combo/Group, Sun-Family(999+).

GAMES:
TRAMPOLINE | BOWLING | KIDS PLAY | LASER TAG | SHOOTING | ARCADE | VR | HYPER GRID | PANDA CLIMB | CRICKET | ROPE COURSE | SKY RIDER | GRAVITY GLIDE.

BOOKING FLOW (6 STEPS):
1. Give Price + Ask "Book karu?"
2. If ha/ok -> Ask Players + Time IMMEDIATELY.
3. Confirm slot.
4. Ask Name + Number.
5. Final summary (---SPLIT--- for bubbles).
6. End with excitement.

CONTINUATION WORDS:
"ok", "ha", "hmm", "yes", "done", "thik hai" -> MOVE TO NEXT STEP. Never repeat questions.

RULES:
- NO stars (*) or headings (#). 
- Food: SHARE PDF LINK ONLY. https://drive.google.com/file/d/1aYTS0y8R6duSAurdJ6qiH_jv7KF3kuS4/preview
- BANNED: kheti, avsar, vivaan, samagri. No "specific cheez" filler.
- Use ---SPLIT--- for clean bubbles.

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
        ...history.slice(-15),
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
