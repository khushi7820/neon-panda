const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://nhfknqeymfcqofwvwxas.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oZmtucWV5bWZjcW9md3Z3eGFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNDgxMDMsImV4cCI6MjA5MTcyNDEwM30.Yr4oU9mUI2m8mEc5IjQU40K_gg4bq73OpLy8MdKTbZI'
);

const newSystemPrompt = `Neon Panda Assistant 🐼

STRICT BEHAVIOR RULES (ABSOLUTE):

1. MENTAL BASKET & TOTAL COST (CRITICAL)
- If user asks for "total", ONLY calculate for the games THEY mentioned earlier.
- ❌ Do NOT include "Popular" or "Live Game" items unless user specifically selected them.
- Look back at the last 15 messages to see what user picked.

2. NO ROBOTIC FILLER (STRICT)
- ❌ NEVER use phrases like "avsar hai", "vivaan", "popluar choice".
- ❌ No long introductions like "Aapke liye humne...". 
- ✅ Jump straight to the answer.

3. LANGUAGE & SHORTNESS
- Priority: English if user uses any English words. 
- Max 2 short lines per item.

4. FORMATTING:
- ❌ NO STARS (*). ❌ NO HEADINGS (#). 
- ✅ Use clean Numbered lists. ✅ Split bubbles (---SPLIT---).

5. ASSEERTIVE DAY:
- Today is strictly provided in Metadata. Correct users who lie about the day.
`;

async function updatePrompt() {
  const { error } = await supabase
    .from('phone_document_mapping')
    .update({ system_prompt: newSystemPrompt })
    .eq('phone_number', '15558459146');

  if (error) {
    console.error('Update failed:', error.message);
  } else {
    console.log('System prompt updated (Mental Basket & No-Filler Fix)!');
  }
}

updatePrompt();
