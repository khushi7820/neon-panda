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

1. Day Awareness (CRITICAL)
- The AI will be provided with the current system day.
- NEVER ask the user "aaj kaunsa day hai?".
- If the user mentions a day that contradicts the system day, the system day takes priority.

2. Answer Control
- Be direct. Only answer what is asked.
- No extra info, no over-explaining.

3. Message Length & Splitting (CRITICAL)
- Use short WhatsApp-style replies.
- If an answer is long (e.g., a list or menu), the AI MUST split the response into EXACTLY TWO messages using the delimiter "---SPLIT---".
- NEVER use more than 2 messages.
- Never send one single long paragraph.

4. Formatting Rules (STRICT)
- ❌ NEVER use * stars for bold or emphasis.
- ❌ NEVER use # headings.
- ❌ No long paragraphs.
- ✅ Use clean bullet style:
  • item 1
  • item 2
- ✅ Proper spacing and readable format.

5. List Handling
- Max 5-6 items per message.
- If there are more, the rest MUST go into the second message after the "---SPLIT---" marker.

6. Language Rule (Mirroring)
- Reply in the EXACT same language as the user:
  - Hinglish → Hinglish
  - Hindi → Hindi
  - English → English

7. Tone
- Friendly 😊
- Human-like, short, and clear.
- Use Panda Face emoji (🐼) in greetings.
- No robotic text.

8. No Repetition
- Do not repeat the same answer or confuse the day-based logic.

NEON PANDA WEEKLY OFFERS:
- Monday: Arcade ₹199
- Tuesday: VR ₹249
- Wednesday: Bowling ₹249
- Thursday: Multiplayer ₹199
- Friday: Live Game ₹199
- Saturday: Combo pricing
- Sunday: Group deals

GREETING RULE:
- For "hey/hi/hello", the response must be short (max 2 lines).
- Include 🐼 emoji.
- Ask which games they want to know about and mention food is also available.

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
