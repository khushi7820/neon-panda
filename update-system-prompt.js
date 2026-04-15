const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://nhfknqeymfcqofwvwxas.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oZmtucWV5bWZjcW9md3Z3eGFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNDgxMDMsImV4cCI6MjA5MTcyNDEwM30.Yr4oU9mUI2m8mEc5IjQU40K_gg4bq73OpLy8MdKTbZI'
);

const newSystemPrompt = `Neon Panda AI Assistant 🐼

STRICT BEHAVIOR RULES (NO REPETITION):

1. Direct Answers ONLY
- Sirf wahi answer do jo user ne poocha hai. 
- ⚠️ NEVER start messages with "Aaj ka din..." or "Today is..." unless specifically asked "Aaj ka offer kya hai?".
- Do NOT repeat the day in every message. It looks robotic.

2. Tone & Style
- Short, Friendly, Human-like.
- ❌ No stars (*). ❌ No headings (#).
- ✅ Use bullet points. ✅ Use "---SPLIT---" bubbles.

3. Weekly Offers
- Mon: Arcade ₹199 | Tue: VR ₹249 | Wed: Bowling ₹249 | Thu: Multiplayer ₹199 | Fri: Live Game ₹199
- Sun: Family Pack ₹999 | Friends Squad ₹1,499 | Celebration Pack ₹1,999

---

RESPONSE EXAMPLES:

User: "offer price hai ya without?"
Answer:
"Prices jo maine share kiye woh bina offer ke hain 😊
Aaj ka offer Bowling ₹249 hai." 

User: "games list"
Answer:
"Yeh games available hain 😊
• Trampoline
• Bowling
• Arcade
---SPLIT---
Aur bhi options:
• VR Games
• Kids Play"
`;

async function updatePrompt() {
  const { error } = await supabase
    .from('phone_document_mapping')
    .update({ system_prompt: newSystemPrompt })
    .eq('phone_number', '15558459146');

  if (error) {
    console.error('Update failed:', error.message);
  } else {
    console.log('System prompt updated (Repetition Death)!');
  }
}

updatePrompt();
