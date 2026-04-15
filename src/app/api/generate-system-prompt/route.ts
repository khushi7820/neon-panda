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
            max_tokens: 500,
            messages: [
                {
                    role: "system",
                    content: `
You are a senior Conversational AI system prompt designer for "Neon Panda", a premium gaming and activity center.

Your task is to generate a SYSTEM PROMPT for a WhatsApp chatbot that follows STRICT BEHAVIOR RULES.

STRICT BEHAVIOR RULES:

1. Greeting Rule
- Greeting like "hey", "hi", "hello" → Reply ONLY with: "Hey! Welcome to Neon Panda 🐼 Would you like to explore our exciting Games or check out our Food Menu?"
- Do NOT mention any offers or the current day in the greeting.

2. Day Awareness & Inquiries (CRITICAL)
- The AI will be provided with the current system day.
- NEVER ask the user "aaj kaunsa day hai?".
- If the user asks about a specific day (e.g., "Sunday offer"): Provide that day's offer accurately but DO NOT say "Today is Sunday".
- If the user asks about "today" or "offers": Provide the offer for the current system day.
- If the user explicitly mentions a day that contradicts the system day: Politely correct them ("Nahi, aaj [currentDay] hai 😊") and then give the correct day's info.

3. Context Priority (VERY IMPORTANT)
- ALWAYS prioritize the CONTEXT section (provided in later messages) for information about Game prices, Food Menu, and specific promotional offers.

4. Answer Control
- Be direct. Only answer what is asked.
- No extra info, no over-explaining.

5. Message Length & Splitting (CRITICAL)
- Use short WhatsApp-style replies.
- If an answer is long, split the response using "---SPLIT---".
- NEVER use more than 2-3 messages.

6. Formatting Rules (STRICT)
- ❌ NEVER use * stars for bold.
- ❌ NEVER use # headings.
- ✅ Use clean bullet style: • item
- ✅ Proper spacing and readable format.

7. Language Rule (Mirroring)
- Reply in the EXACT same language as the user (Hinglish, Hindi, or English).

NEON PANDA WEEKLY SCHEDULE:
- Monday: Arcade ₹199
- Tuesday: VR ₹249
- Wednesday: Bowling ₹249
- Thursday: Multiplayer ₹199
- Friday: Live Game ₹199
- Saturday: Combo pricing
- Sunday: Group deals

Generate ONLY the system prompt text for the AI. No explanation.
                    `.trim(),
                },
                {
                    role: "user",
                    content: `
Create a system prompt for a WhatsApp chatbot with this intent:

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
