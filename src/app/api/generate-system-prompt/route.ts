import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import { supabase } from "@/lib/supabaseClient";

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
});

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { intent, phone_number } = body;

        if (!intent || !phone_number) {
            return NextResponse.json(
                { error: "Intent and phone_number are required" },
                { status: 400 }
            );
        }

        console.log("Generating system prompt for intent:", intent);

        const completion = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            temperature: 0.6,
            max_tokens: 800,
            messages: [
                {
                    role: "system",
                    content: `
You are a senior Conversational AI system prompt designer. Your task is to generate a SYSTEM PROMPT for a WhatsApp chatbot for "Neon Panda" with the following STRICT RULES.

GENERAL RULES:
1. Day Awareness (CRITICAL)
- The bot must internally know the current day (provided in context as "CURRENT DAY: [Day]").
- NEVER ask "aaj kaunsa day hai?".
- If the user says it's a different day, the user's input overrides the internal day for that specific conversation.

2. Answer Control
- Answer ONLY what is asked. Be concise.
- No extra info or over-explaining.

3. Message Length & Splitting
- If the answer is long or contains a large list, you MUST split it into multiple separate small messages/bubbles using a double newline "\n\n" as a separator.
- Example: 13 games? Send group 1 (1-5), then \n\n, then group 2 (6-10), then \n\n, then group 3 (11-13).
- NEVER omit information from the documents. Provide EVERYTHING the user asks for, just split it into bubbles.
- No long paragraphs in a single bubble.

4. Formatting Rules (VERY IMPORTANT)
- ❌ STRICTLY NO markdown symbols: No stars (*), no hashtags (#), no underscores (_).
- ✅ Use clean bullet styles:
  * item 1
  * item 2
- ✅ Proper spacing and readable plain text.

5. List Handling (CRITICAL)
- If a list is large (e.g., desserts, games):
  → Max 5-6 items per message bubble. Use a second message if there are more.

6. Language & Tone
- Mirror user's language (Hinglish -> Hinglish, Hindi -> Hindi, English -> English).
- Friendly tone 😊, human-like, short and clear, no robotic text.
- ✅ Use the Panda Face emoji (🐼) naturally in greetings or key messages.
- Greeting Rule: If the user says "hey", "hi", "hello", or starts a new conversation, reply with a warm, welcoming message that reflects the "Neon Panda" brand.
  * In the greeting, ask if they would like to know about our **Games** or our **Food/Menu**.
  * Example: "Hey! Welcome to Neon Panda 🐼 Would you like to explore our Games or check out our Food Menu? 😊"

7. No Repetition
- Same answer repeat mat karo.

NEON PANDA SPECIFIC CONTEXT:
Weekly offers are auto-day based:
- Monday: Arcade ₹199
- Tuesday: VR ₹249
- Wednesday: Bowling ₹249
- Thursday: Multiplayer ₹199
- Friday: Live Game ₹199
- Saturday: Combo pricing
- Sunday: Group deals

KNOWLEDGE BOUNDARY:
- ONLY answer from provided document context.
- If info is missing, politely say: "Mere paas is topic par abhi exact data available nahi hai 😊 Aap kuch aur pooch sakte ho."

Generate ONLY the system prompt text. No explanation. Keep it under 400 words.
                    `.trim(),
                },
                {
                    role: "user",
                    content: `
Create a system prompt for a WhatsApp chatbot for the business "Neon Panda" with this intent:
"${intent}"
                    `.trim(),
                },
            ],
        });

        const systemPrompt = completion.choices[0]?.message?.content?.trim();

        if (!systemPrompt) {
            console.error("❌ Groq returned no content");
            throw new Error("LLM failed to generate content. Please check your Groq API quota or model availability.");
        }

        console.log("✅ Generated system prompt successfully");

        // Check if phone number already exists
        const { data: existingMappings, error: fetchError } = await supabase
            .from("phone_document_mapping")
            .select("*")
            .eq("phone_number", phone_number);

        if (fetchError) {
            console.error("❌ Supabase fetch error:", fetchError);
            throw new Error(`Database fetch failed: ${fetchError.message}`);
        }

        if (existingMappings && existingMappings.length > 0) {
            console.log("📝 Updating existing mapping...");
            const { error: updateError } = await supabase
                .from("phone_document_mapping")
                .update({
                    intent,
                    system_prompt: systemPrompt,
                })
                .eq("phone_number", phone_number);

            if (updateError) {
                console.error("❌ Supabase update error:", updateError);
                throw new Error(`Database update failed: ${updateError.message}. Did you run the migration?`);
            }
        } else {
            console.log("➕ Inserting new mapping...");
            const { error: insertError } = await supabase
                .from("phone_document_mapping")
                .insert({
                    phone_number,
                    intent,
                    system_prompt: systemPrompt,
                    file_id: null, // This requires file_id to be nullable in DB
                });

            if (insertError) {
                console.error("❌ Supabase insert error:", insertError);
                throw new Error(`Database insert failed: ${insertError.message}. Check if file_id is nullable.`);
            }
        }

        return NextResponse.json({
            success: true,
            system_prompt: systemPrompt,
            intent,
        });

    } catch (error: any) {
        console.error("🔥 SYSTEM PROMPT API ERROR:", error);

        return NextResponse.json(
            {
                success: false,
                error: error.message || "An unexpected error occurred",
                details: error.hint || undefined
            },
            { status: 500 }
        );
    }
}
