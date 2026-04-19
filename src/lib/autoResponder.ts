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
      .limit(10);

    const history: { role: "user" | "assistant"; content: string }[] = (historyRows || [])
      .filter((m) => m.content_text)
      .map((m) => ({
        role: m.event_type === "MoMessage" ? "user" : "assistant",
        content: m.content_text as string,
      }));

    const normalizedText = userText.toLowerCase().trim();
    const isGreeting = /^(hi|hello|hey|hiii|namaste|hola|helo|hlo|start)$/i.test(normalizedText);

    // ═══════════════════════════════════════
    // HARDCODED BOOKING LINK INTERCEPT
    // ═══════════════════════════════════════
    const confirmWords = /^(yes|yes book|ok|okk|okay|okayy|confirm|book|book karo|ha|haa|haan|done|thik hai|go|fine|kar do|karo|bhej|bhej do|bhejo|book my selected items|book my items)$/i;
    
    if (confirmWords.test(normalizedText)) {
      // Get last 5 messages to find context
      const recentMessages = history.slice(-5);
      const lastBotMessage = [...recentMessages].reverse().find(m => m.role === 'assistant');
      
      if (lastBotMessage) {
        const lastMsg = lastBotMessage.content;
        
        // CASE 1: Games selection confirmation → Send booking link
        if (lastMsg.includes('Aapke selected items 🎮') && lastMsg.includes('Total: ₹')) {
          // Extract game names from last message
          const gameIdMap: Record<string, string> = {
            'trampoline': 'trampoline',
            'bowling': 'bowling',
            'kids play': 'kids_play',
            'laser tag': 'laser_tag',
            'shooting': 'shooting',
            'arcade': 'arcade',
            'vr': 'vr',
            'hyper grid': 'hyper_grid',
            'panda climb': 'panda_climb',
            'cricket': 'cricket',
            'rope course': 'rope_course',
            'sky rider': 'sky_rider',
            'gravity glide': 'gravity_glide'
          };
          
          const gameIds: string[] = [];
          const lowerMsg = lastMsg.toLowerCase();
          
          for (const [name, id] of Object.entries(gameIdMap)) {
            if (lowerMsg.includes(name)) {
              gameIds.push(id);
            }
          }
          
          const gamesParam = gameIds.length > 0 ? gameIds.join(',') : '';
          const bookingMsg = `Perfect! 🎉 Booking process ho rahi hai...\n\n👉 https://neon-panda.vercel.app/book-games?games=${gamesParam}\n\nAapke games pre-selected hain. Date, time, players, name fill karo. Form mein today's offer toggle bhi hai! Instant WhatsApp confirmation! ⚡`;
          
          const sendResult = await sendWhatsAppMessage(fromNumber, bookingMsg, auth_token!, origin!);
          
          if (sendResult.success) {
            await supabase.from("whatsapp_messages").insert([{
              message_id: `booking_${Date.now()}`,
              channel: "whatsapp",
              from_number: toNumber,
              to_number: fromNumber,
              received_at: new Date().toISOString(),
              content_type: "text",
              content_text: bookingMsg,
              event_type: "MtMessage"
            }]);
          }
          return { success: true };
        }
        
        // CASE 2: Booking confirmed → Welcome reply
        if (lastMsg.includes('Booking ID:') || lastMsg.includes('Booking Confirmed') || lastMsg.includes('See you soon!')) {
          const welcomeMsg = `Welcome! 🐼 See you soon at Neon Panda! 🔥 Enjoy karo!`;
          const sendResult = await sendWhatsAppMessage(fromNumber, welcomeMsg, auth_token!, origin!);
          
          if (sendResult.success) {
            await supabase.from("whatsapp_messages").insert([{
              message_id: `welcome_${Date.now()}`,
              channel: "whatsapp",
              from_number: toNumber,
              to_number: fromNumber,
              received_at: new Date().toISOString(),
              content_type: "text",
              content_text: welcomeMsg,
              event_type: "MtMessage"
            }]);
          }
          return { success: true };
        }
        
        // CASE 3: Food items selected → Order confirmation
        if (lastMsg.includes('Aapke selected items 🍽️') && lastMsg.includes('+91 99931 27979')) {
          const foodMsg = `Great! 🎉 Order karne ke liye abhi call karein:\n📞 +91 99931 27979\n\nStaff aapka order confirm karke total bata dega! 🐼`;
          const sendResult = await sendWhatsAppMessage(fromNumber, foodMsg, auth_token!, origin!);
          
          if (sendResult.success) {
            await supabase.from("whatsapp_messages").insert([{
              message_id: `food_${Date.now()}`,
              channel: "whatsapp",
              from_number: toNumber,
              to_number: fromNumber,
              received_at: new Date().toISOString(),
              content_type: "text",
              content_text: foodMsg,
              event_type: "MtMessage"
            }]);
          }
          return { success: true };
        }
      }
    }
    // ═══════════════════════════════════════
    // END HARDCODED INTERCEPTS
    // ═══════════════════════════════════════

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
      const sendResult = await sendWhatsAppMessage(fromNumber, greetingMsg, auth_token!, origin!);
      
      if (sendResult.success) {
        await supabase.from("whatsapp_messages").insert([{
          message_id: `greet_${Date.now()}`,
          channel: "whatsapp",
          from_number: toNumber,
          to_number: fromNumber,
          received_at: new Date().toISOString(),
          content_type: "text",
          content_text: greetingMsg,
          event_type: "MtMessage"
        }]);
      }
      return { success: true };
    }

    const embedding = await embedText(userText);
    if (!embedding) return { success: false, error: "Embedding failed" };

    const matches = await retrieveRelevantChunksFromFiles(embedding, fileIds, 3);
    const contextText = matches.map((m) => m.chunk.slice(0, 400)).join("\n\n");

    const systemPrompt = `
You are Panda Bot 🐼 for Neon Panda, Indore.

${system_prompt || ""}

TODAY: ${currentDay} | Offer: ${todaysOffer}

CRITICAL RULE FOR DAY CORRECTION:
- IF the user explicitly types the WRONG day (e.g., they ask for "Friday offer" when today is "${currentDay}"), YOU MUST correct them by saying: "Arre nahi 😄 Aaj toh ${currentDay} hai!"
- IF the user does NOT explicitly name a wrong day (e.g., they just say "yes" or "ok"), YOU MUST NEVER say "Arre nahi".

CONTEXT (if relevant):
${contextText || ""}
`;

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      temperature: 0.1,
      max_tokens: 500,
      messages: [
        { role: "system", content: systemPrompt },
        ...history.slice(-8),
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
          
          if (send.success) {
            await supabase.from("whatsapp_messages").insert([{
              message_id: `audio_${Date.now()}_${i}`,
              channel: "whatsapp",
              from_number: toNumber,
              to_number: fromNumber,
              received_at: new Date().toISOString(),
              content_type: "audio",
              content_text: bubble, // Save text for memory tracing
              event_type: "MtMessage",
              raw_payload: { audio_url: finalResponseUrl }
            }]);
          }
        } catch {
          const send = await sendWhatsAppMessage(fromNumber, bubble, auth_token!, origin!);
          lastSendResult = send;
          
          if (send.success) {
            await supabase.from("whatsapp_messages").insert([{
              message_id: `msg_${Date.now()}_${i}`,
              channel: "whatsapp",
              from_number: toNumber,
              to_number: fromNumber,
              received_at: new Date().toISOString(),
              content_type: "text",
              content_text: bubble,
              event_type: "MtMessage"
            }]);
          }
        }
      } else {
        const send = await sendWhatsAppMessage(fromNumber, bubble, auth_token!, origin!);
        lastSendResult = send;
        
        if (send.success) {
          await supabase.from("whatsapp_messages").insert([{
            message_id: `msg_${Date.now()}_${i}`,
            channel: "whatsapp",
            from_number: toNumber,
            to_number: fromNumber,
            received_at: new Date().toISOString(),
            content_type: "text",
            content_text: bubble,
            event_type: "MtMessage"
          }]);
        }
      }

      if (responseBubbles.length > 1 && i < responseBubbles.length - 1) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    if (!lastSendResult.success) return { success: false, error: lastSendResult.error };

    return { success: true, response, sent: true };
  } catch (err) {
    console.error("AUTO RESPONDER ERROR:", err);
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}