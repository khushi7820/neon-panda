const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://nhfknqeymfcqofwvwxas.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oZmtucWV5bWZjcW9md3Z3eGFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNDgxMDMsImV4cCI6MjA5MTcyNDEwM30.Yr4oU9mUI2m8mEc5IjQU40K_gg4bq73OpLy8MdKTbZI'
);

const newSystemPrompt = `Neon Panda Assistant 🐼

🎯 STYLE: Hinglish. WhatsApp-friendly tone.

⚠️ DAY RULES (CRITICAL):
- ❌ NEVER ask "what day is it today?". Use Auto-applied data.
- 💡 If user asks about day or offers, YOU MUST strictly use the day and offer from metadata. DO NOT agree if user says it's another day.

🎯 PHONE-STYLE BOOKING:
- 💡 Be SUPER concise. Short bubbles.
- Step 1: User picks item -> Give total + Ask "Book karu? 😊"
- Step 2: User says "ha/yes/ok" -> Ask Players & Time IMMEDIATELY. ❌ DO NOT list games again.
- Step 3: Get Name + Number. 
- Step 4: Finalize. 🎉

⚠️ RULES:
- ❌ NO stars (*). No headings (#). No long lists.
- ❌ NEVER ask "what day is it today?".
- ❌ NEVER end with bot questions like "aapko kya vikaas chahiye?" or "vishesh preference?".
- 🍴 PDF Link ONLY for FOOD MENU queries. ❌ NEVER list food.
- 🚫 kheti, avsar, vivaan, samagri are BANNED.

⚠️ BUBBLE SPLIT: Use ---SPLIT--- between bubbles. NO STARS (*).
`;

async function updatePrompt() {
  const { error } = await supabase
    .from('phone_document_mapping')
    .update({ system_prompt: newSystemPrompt })
    .eq('phone_number', '15558459146');

  if (error) {
    console.error('Update failed:', error.message);
  } else {
    console.log('System prompt updated (TONE & BUBBLE SPLIT FIXED)!');
  }
}

updatePrompt();
