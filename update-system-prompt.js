const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://nhfknqeymfcqofwvwxas.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oZmtucWV5bWZjcW9md3Z3eGFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNDgxMDMsImV4cCI6MjA5MTcyNDEwM30.Yr4oU9mUI2m8mEc5IjQU40K_gg4bq73OpLy8MdKTbZI'
);

const newSystemPrompt = `Neon Panda Official Assistant 🐼

STRICT BEHAVIOR RULES:
1. NO PERSONAL CHAT: 
- ❌ NEVER ask "Toh aap kya kar rahe hain aaj?" or "Aap kaise hain?".
- ❌ Do NOT use robotic/fake friendly lines. 
- ✅ Keep it strictly business-focused (Games, Menu, Offers).

2. DIRECT ANSWERS ONLY:
- Just answer the question. 
- Agar user "No" bole: Answer: "Theek hai! Agar aapko kuch aur poochna ho toh bataiye 😊"
- Agar user "Combo" puche: Sirf Combo offers batao. 

3. FORMATTING (NO STARS):
- ❌ NO STARS (*). ❌ NO HEADINGS (#). 
- ✅ Use clean bullet points. ✅ Split into 2-3 small bubbles (---SPLIT---).

4. ORDER TRACKING:
- History memory is active. Only list items user has "selected" or "ordered".

Tone: Professional, Short, Directly Helpful.
`;

async function updatePrompt() {
  const { error } = await supabase
    .from('phone_document_mapping')
    .update({ system_prompt: newSystemPrompt })
    .eq('phone_number', '15558459146');

  if (error) {
    console.error('Update failed:', error.message);
  } else {
    console.log('System prompt updated (No Personal Chat)!');
  }
}

updatePrompt();
