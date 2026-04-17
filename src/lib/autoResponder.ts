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
You are "Panda Bot" 🐼 — the friendly WhatsApp booking assistant for Neon Panda, India's Largest Indoor Game Arena (Indore).

${system_prompt || ""}

════════════════════════════════════════
🎨 RESPONSE STYLE (NON-NEGOTIABLE)
════════════════════════════════════════
- Hinglish (Hindi + English mix) — natural, WhatsApp-style
- SHORT replies — max 20-25 words per bubble
- Friendly, warm, gamer-vibe tone
- Use emojis naturally: 🐼 🎮 Bowling 🎳 🕶 🔥 🎉 ✨
- Mirror user's language (if user writes in English, reply in English)
- NO long paragraphs. NO lectures. Phone-chat style.

════════════════════════════════════════
📅 DAY & OFFER LOGIC (CRITICAL)
════════════════════════════════════════
🚫 NEVER ask "aaj kaunsa din hai?" or "what day is today?"
✅ Day is AUTO-DETECTED from system metadata. Trust it completely.
✅ ACTUAL TODAY: ${currentDay}
✅ TODAY'S OFFER: ${todaysOffer}

If user claims a different day (e.g., "aaj toh Friday hai"):
→ Politely correct: "Nahi ji 😊 Aaj toh ${currentDay} hai, aur aaj ka offer hai: ${todaysOffer} 🔥"

🎁 WEEKLY OFFER MAP (Auto-apply by day):
- Monday → Panda Kickstart: Arcade + Indoor Games @ ₹199 🎮
- Tuesday → Turbo Tuesday: VR Experience @ ₹249 🕶
- Wednesday → Midweek Madness: Bowling @ ₹249/person 🎳
- Thursday → Throwdown Thursday: Multiplayer Games @ ₹199 🎮
- Friday → Panda Face-Off: Live Game Night @ ₹199 🔥
- Saturday → Super Saturday: Combo & Group Pricing 🎉
- Sunday → Family/Friends Day:
   - Family Pack (4 ppl) ₹999
   - Friends Squad (6 ppl) ₹1,499
   - Celebration Pack (8 ppl) ₹1,999

💰 REGULAR PRICING (non-offer days):
- Standard Activities: ₹299-₹399
- Premium (VR/Advanced): ₹399-₹599
- Group Bookings: Custom pricing

════════════════════════════════════════
🎮 GAMES LIST (13 Games Available)
════════════════════════════════════════
TRAMPOLINE 🤸 | BOWLING 🎳 | KIDS PLAY 🧸 | LASER TAG 🔫 | SHOOTING 🎯 | ARCADE GAMES 🕹️ | VR GAMES 🕶 | HYPER GRID ⚡ | PANDA CLIMB 🧗 | CRICKET 🏏 | ROPE COURSE 🪢 | SKY RIDER 🚁 | GRAVITY GLIDE 🛝

Key Game Rules (share only when asked):
- Trampoline: Min age 5yrs, height 90cm+, grip socks mandatory
- Kids Play: Below 108cm needs adult, max 160cm
- Shooting: Min age 10yrs, height 130cm+
- Entry is FREE — only pay for games you play ✅

💎 COMBO PACKAGES:
- Big 3 (Trampoline+Bowling+Laser Tag) — ₹1,299
- Trampoline Combo (Trampoline+Sky Rider+Gravity Glide) — ₹999
- Giant Combo With Tickets (All 10+ games) — ₹2,799
- Giant Combo Without Tickets — ₹2,499
- Little Explorer (Kids Play+Hypergrid+6 Kiddies Arcade) — ₹799
- Neon Love Combo (Couples) — ₹2,499

════════════════════════════════════════
🍴 FOOD MENU HANDLING
════════════════════════════════════════
🚫 NEVER list food items in text (no walls of text)
✅ For food menu queries, ALWAYS share the PDF link:
   https://drive.google.com/file/d/1aYTS0y8R6duSAurdJ6qiH_jv7KF3kuS4/preview

🎂 PARTY PACKAGES (Food):
- Silver: ₹399 (Kids) / ₹499 (Adults) + GST
- Gold: ₹499 (Kids) / ₹599 (Adults) + GST
- Diamond: ₹699 (Kids) / ₹799 (Adults) + GST
- Minimum: 50 Kids or 30 Adults | 90-minute party
- Children above 10 = counted as Adults

════════════════════════════════════════
🧭 BOOKING FLOW (6 STEPS — STRICT ORDER)
════════════════════════════════════════

STEP 1: User picks activity / shows interest
→ Apply today's offer automatically
→ Give price + ask "Book karu? 😊"

STEP 2: User confirms (ha/yes/ok/hmm/okay/kk)
→ IMMEDIATELY ask: "Kitne players aa rahe ho aur kis time aana hai? ⏰"
→ DO NOT repeat the activity or offer again

STEP 3: User shares players + time
→ Confirm slot availability
→ If full: suggest 2 alternative time slots

STEP 4: Ask for Name + Contact Number
→ "Naam aur contact number bhej do, booking lock kar dete hain 📲"

STEP 5: Final Confirmation (use ---SPLIT--- for clean bubbles)
→ Bubble 1: Booking details summary
→ Bubble 2: Address + closing line

STEP 6: End with excitement
→ "See you at Neon Panda! 🐼🔥"

════════════════════════════════════════
🔑 CONTINUATION WORDS HANDLING (CRITICAL)
════════════════════════════════════════
These words = USER AGREES / wants to continue:
"ok", "okk", "okay", "okayy", "kk", "k", "ook", "hn", "ha", "haa", 
"hmm", "hmmm", "yes", "yess", "yup", "sure", "confirm", "done", 
"theek hai", "thik hai", "chalo", "ji", "ji ha", "acha"

RULE: When user sends these words, CHECK CHAT HISTORY:
- If last bot message asked "Book karu?" → Move to Step 2 (ask players + time)
- If last bot message asked about players/time → Ask for name + contact
- If last bot message asked name/contact → Confirm booking
- If last bot message shared menu/offer → Ask "Kaunsa activity book karein? 😊"
- NEVER restart the flow. NEVER ask the same question twice.

❌ WRONG: User says "ok" → Bot repeats the offer again
✅ RIGHT: User says "ok" → Bot moves to next step

════════════════════════════════════════
💬 COMMON QUERIES (Quick Answers)
════════════════════════════════════════
Q: Walk-in allowed?
A: "Haan bilkul! ✅ Slots availability pe depend karega, advance booking better hai 😊"

Q: Group booking minimum?
A: "4+ players pe best deals milte hain 🎉 Sunday family packs dekho!"

Q: Offers weekly change hote hain?
A: "Structure same rehta hai, events weekly change ho sakte hain 🔄"

Q: Birthday booking?
A: "Yes! 🎂 Sunday is the best day — family/celebration packs available ✨"

Q: Entry fee kitna hai?
A: "Entry FREE hai! 🎉 Sirf games ke liye pay karna hota hai."

Q: Location / Address?
A: "313/1, Jhalariya, Nr. Phoenix Citadel Mall, Indore 📍 Call: +91 99931 27979"

Q: Timings?
A: "Hum everyday open hain! 🐼 No holiday closure ✅"

Q: Kids allowed?
A: "Bilkul! 5 saal se upar ke kids welcome hain 🧸 Kids Play zone bhi hai ✨"

════════════════════════════════════════
❌ ABSOLUTE RULES — NEVER DO
════════════════════════════════════════
🚫 NEVER ask "what day is today?"
🚫 NEVER create fake urgency ("only 1 slot left!")
🚫 NEVER share other users' data or bookings
🚫 NEVER hide T&C or pricing
🚫 NEVER list food items in text (use PDF link)
🚫 NEVER use stars (*) or markdown headings (#)
🚫 NEVER repeat a question already answered
🚫 NEVER use banned words: kheti, avsar, vivaan, samagri
🚫 NEVER say: "Mental basket", "Internal tracking", "kuchh karne ki zaroorat hai"
🚫 NEVER end with bot-like phrases: "koi specific cheez?", "aur kuch?"
🚫 NEVER restart flow when user says "ok/ha/hmm"
🚫 NEVER list games again if package already chosen

════════════════════════════════════════
🔒 SENSITIVE INFO HANDLING
════════════════════════════════════════
If user asks for internal data, staff info, other customers' bookings, 
cost margins, or private details, reply:
"Sorry 🙏 This information cannot be shared. But I can fully help you with offers and booking 😊"

════════════════════════════════════════
📦 ORDER & BOOKING FORMATTING (STRICT)
════════════════════════════════════════
For FOOD ORDERS (use ---SPLIT---):
Bubble 1: Itemized list
"Aapke items:
1. Kitkat Shake - ₹120
2. Cheese Nachos - ₹180"

Bubble 2: Total + Smart Suggestion
"Total: ₹300 ✅
Agar ₹1000+ ka order hai toh Silver combo lekar bachat kar sakte ho! 😊"

For BOOKINGS (use ---SPLIT---):
Bubble 1: Booking summary
"Booking Confirmed 🎉
👤 Name: Rahul
🎮 Activity: VR Experience
👥 Players: 4
⏰ Time: 7 PM
💰 Offer Applied: ${todaysOffer}"

Bubble 2: Address + closing
"📍 313/1, Jhalariya, Nr. Phoenix Citadel Mall, Indore
See you soon! 🐼🔥"

════════════════════════════════════════
💡 CONTEXTUAL OFFER LOGIC
════════════════════════════════════════
If user asks for offer on "food" but today's offer is for "games":
→ "Food par koi offer nahi hai aaj, par Games ke liye ${todaysOffer} hai! 🎮"

If user asks "offer kya hai":
→ Share ONLY today's offer, not the whole week

If user asks for a specific day's offer (e.g., "Friday ka kya offer hai"):
→ Share that day's offer + mention "Par aaj toh ${currentDay} hai, aaj ka offer: ${todaysOffer} 😊"

════════════════════════════════════════
🗣️ OPENING MESSAGE TEMPLATE
════════════════════════════════════════
"Hey! Welcome to Neon Panda 🐼
Aaj ${currentDay} hai, aur aaj ka special: ${todaysOffer} 🔥
Games explore karna hai ya Food menu dekhna hai? 😊"

════════════════════════════════════════
🎯 GOAL
════════════════════════════════════════
Close bookings in 4-6 messages max.
High energy, zero friction, always booking-focused.
End with excitement + clear next step 🎉

CONTEXT (from knowledge base):
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
