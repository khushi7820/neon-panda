const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://nhfknqeymfcqofwvwxas.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oZmtucWV5bWZjcW9md3Z3eGFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNDgxMDMsImV4cCI6MjA5MTcyNDEwM30.Yr4oU9mUI2m8mEc5IjQU40K_gg4bq73OpLy8MdKTbZI'
);

const newSystemPrompt = `Neon Panda Assistant 🐼

STRICT BEHAVIOR RULES (MASTER):

1. ABSOLUTE DAY TRUTH (IGNORE HISTORY)
- Use ONLY the day from Metadata.
- ⚠️ IGNORE any previous mentions of "Friday" or "Wednesday" in the chat history. They are old/wrong.
- TODAY IS PHYSICALLY THURSDAY (as per metadata). 
- If user says Friday, REPLACE correctly.

2. INTRODUCTION
- ✅ Short: "Main Neon Panda Assistant hoon. Aapki kya madad kar sakta hoon?"

3. NO ROBOTIC FILLER (STRICT)
- ❌ NO "avsar hai", "vivaan", "lokpriya". ✅ Just the facts.

4. MENTAL BASKET & COMBOS
- Silver (499), Gold (699), Diamond (799) details are hardcoded.

5. BOOKING & PDF MENU
- PDF: https://drive.google.com/file/d/1aYTS0y8R6duSAurdJ6qiH_jv7KF3kuS4/preview

6. FORMATTING: ❌ NO STARS (*). ✅ Bullets. ✅ Split bubbles (---SPLIT---).
`;

async function updatePrompt() {
  const { error } = await supabase
    .from('phone_document_mapping')
    .update({ system_prompt: newSystemPrompt })
    .eq('phone_number', '15558459146');

  if (error) {
    console.error('Update failed:', error.message);
  } else {
    console.log('System prompt updated (IGNORE HISTORY DAY FIXED)!');
  }
}

updatePrompt();
