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

async function detectLanguage(text: string): Promise<string> {
  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      temperature: 0,
      messages: [
        { role: "system", content: "Detect the language. Reply ONLY with: English, Hindi, or Hinglish." },
        { role: "user", content: text },
      ],
    });
    return completion.choices[0]?.message?.content?.toLowerCase() || "english";
  } catch {
    return "english";
  }
}

function formatWhatsAppResponse(text: string): string {
  return text.replace(/\n{3,}/g, "\n\n").trim().slice(0, 4000);
}

export async function generateAutoResponse(
  fromNumber: string,
  toNumber: string,
  messageText: string | null,
  messageId: string,
  mediaUrl?: string
): Promise<AutoResponseResult> {
  try {
    if (toNumber !== '15558459146') {
      return { success: false, error: "Auto-responder only active for 15558459146" };
    }
    const fileIds = await getFilesForPhoneNumber(toNumber);
    if (fileIds.length === 0) {
      return { success: false, noDocuments: true, error: "No data configured" };
    }

    const { data: phoneMappings } = await supabase
      .from("phone_document_mapping")
      .select("system_prompt, auth_token, origin")
      .eq("phone_number", toNumber)
      .limit(1);

    if (!phoneMappings?.length) return { success: false, error: "Phone configuration missing" };
    const { system_prompt, auth_token, origin } = phoneMappings[0];
    if (!auth_token || !origin) return { success: false, error: "WhatsApp credentials missing" };

    let userText = messageText?.trim() || "";
    let language = "english";
    const isVoiceRequest = !!mediaUrl;

    if (!userText && mediaUrl) {
      const transcript = await speechToText(mediaUrl);
      if (!transcript?.text) return { success: false, error: "Voice transcription failed" };
      userText = transcript.text.trim();
      language = transcript.language || (await detectLanguage(userText));
    }

    if (userText && (language === "english" || language === "unknown")) {
      language = await detectLanguage(userText);
    }

    if (!userText) return { success: false, error: "Empty message" };

    // FIXED: Proper bidirectional history query
    const { data: historyRows } = await supabase
      .from("whatsapp_messages")
      .select("content_text, event_type, received_at")
      .or(`and(from_number.eq.${fromNumber},to_number.eq.${toNumber}),and(from_number.eq.${toNumber},to_number.eq.${fromNumber})`)
      .order("received_at", { ascending: true })
      .limit(10); // REDUCED from 18 to 10

    const history: { role: "user" | "assistant"; content: string }[] = (historyRows || [])
      .filter((m) => m.content_text)
      .map((m) => ({
        role: m.event_type === "MoMessage" ? "user" : "assistant",
        content: m.content_text as string,
      }));

    const normalizedText = userText.toLowerCase().trim();
    const isGreeting = /^(hi|hello|hey|hiii|namaste|hola|helo|hlo|start)$/i.test(normalizedText);

    const currentDay = new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      timeZone: 'Asia/Kolkata'
    }).format(new Date());

    const dayOfferMap: Record<string, string> = {
      'Monday': 'Panda Kickstart: Arcade @ ₹199 🎮',
      'Tuesday': 'Turbo Tuesday: VR @ ₹249 🕶',
      'Wednesday': 'Midweek Madness: Bowling @ ₹249 🎳',
      'Thursday': 'Throwdown Thursday: Multi @ ₹199 🎮',
      'Friday': 'Panda Face-Off: Live Night @ ₹199 🔥',
      'Saturday': 'Super Saturday: Combo & Group Pricing 🎉',
      'Sunday': 'Family ₹999 | Friends ₹1499 | Celebration ₹1999'
    };
    const todaysOffer = dayOfferMap[currentDay] || "Panda Specials!";

    if (isGreeting) {
      const greetingMsg = `Hey! Welcome to Neon Panda 🐼\nAaj ${currentDay} hai, aur aaj ka special: ${todaysOffer}\nGames explore karna hai ya Food menu dekhna hai? 😊`;
      await sendWhatsAppMessage(fromNumber, greetingMsg, auth_token!, origin!);

      await supabase.from("whatsapp_messages").insert([{
        message_id: `auto_${messageId}_${Date.now()}`,
        channel: "whatsapp",
        from_number: toNumber,
        to_number: fromNumber,
        received_at: new Date().toISOString(),
        content_text: greetingMsg,
        sender_name: "AI Assistant",
        event_type: "MtMessage",
        is_in_24_window: true,
      }]);

      return { success: true };
    }

    const embedding = await embedText(userText);
    if (!embedding) return { success: false, error: "Embedding failed" };

    const matches = await retrieveRelevantChunksFromFiles(embedding, fileIds, 3);
    const contextText = matches.map((m) => m.chunk.slice(0, 400)).join("\n\n");

    // SIMPLIFIED system prompt - NO complex state injection
    const systemPrompt = `
You are Panda Bot 🐼 for Neon Panda, Indore.

${system_prompt || ""}

TODAY: ${currentDay} | Offer: ${todaysOffer}

If user claims wrong day, politely correct: "Arre nahi 😄 Aaj toh ${currentDay} hai!"

CONTEXT (if relevant):
${contextText || ""}
`;

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      temperature: 0.1,
      max_tokens: 500,
      messages: [
        { role: "system", content: systemPrompt },
        ...history.slice(-8), // REDUCED from 16 to 8
        { role: "user", content: userText },
      ],
    });

    let response = completion.choices[0]?.message?.content;
    if (!response) return { success: false, error: "Empty AI response" };

    response = response.replace(/\*/g, "");
    response = formatWhatsAppResponse(response);

    const responseBubbles = response.split("---SPLIT---").map(b => b.trim()).filter(Boolean);
    let lastSendResult: { success: boolean; error?: string } = { success: false, error: "No messages sent" };
    let finalResponseUrl = "";

    for (let i = 0; i < responseBubbles.length; i++) {
      const bubble = responseBubbles[i];

      if (isVoiceRequest) {
        try {
          const audioBuffer = await textToSpeech(bubble, language);
          const fileName = `v_${Date.now()}_${i}.mp3`;
          const { error: uploadError } = await supabase.storage
            .from("voice_replies")
            .upload(fileName, audioBuffer, { contentType: "audio/mpeg", upsert: true });

          if (uploadError) throw uploadError;

          const { data: { publicUrl } } = supabase.storage
            .from("voice_replies").getPublicUrl(fileName);
          finalResponseUrl = publicUrl;

          const send = await sendWhatsAppAudio(fromNumber, finalResponseUrl, auth_token!, origin!);
          lastSendResult = send;
        } catch {
          const send = await sendWhatsAppMessage(fromNumber, bubble, auth_token!, origin!);
          lastSendResult = send;
        }
      } else {
        const send = await sendWhatsAppMessage(fromNumber, bubble, auth_token!, origin!);
        lastSendResult = send;
      }

      if (responseBubbles.length > 1 && i < responseBubbles.length - 1) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    if (!lastSendResult.success) return { success: false, error: lastSendResult.error };

    await supabase.from("whatsapp_messages").insert([{
      message_id: `auto_${messageId}_${Date.now()}`,
      channel: "whatsapp",
      from_number: toNumber,
      to_number: fromNumber,
      received_at: new Date().toISOString(),
      content_type: isVoiceRequest && finalResponseUrl ? "audio" : "text",
      content_text: response,
      raw_payload: { audio_url: finalResponseUrl },
      sender_name: "AI Assistant",
      event_type: "MtMessage",
      is_in_24_window: true,
    }]);

    return { success: true, response, sent: true };
  } catch (err) {
    console.error("AUTO RESPONDER ERROR:", err);
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}