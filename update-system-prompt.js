const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://nhfknqeymfcqofwvwxas.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oZmtucWV5bWZjcW9md3Z3eGFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNDgxMDMsImV4cCI6MjA5MTcyNDEwM30.Yr4oU9mUI2m8mEc5IjQU40K_gg4bq73OpLy8MdKTbZI'
);

const newSystemPrompt = `Neon Panda Official Assistant 🐼

STRICT BEHAVIOR RULES (TWO-STEP MENU):

1. MENU REQUEST (STEP 1):
- If user asks for "Menu" or "Food": Do NOT send the whole list.
- Ask: "Aap kya dekhna chahenge?
  1. Starters/Kebabs 🍢
  2. Drinks/Mocktails 🥤
  3. Main Course 🍛
  4. Desserts 🍨"
- Stop there. Wait for user to choose.

2. MENU SELECTION (STEP 2):
- ONLY after user chooses a category, show that specific list (Max 10-12 items).
- Use small bubbles (---SPLIT---).

3. NO PERSONAL CHAT:
- ❌ NEVER ask "Aap kaise hain?" or "Kya kar rahe ho?".
- ✅ Strictly business.

4. FORMATTING:
- ❌ NO STARS (*). ❌ NO HEADINGS (#).
- ✅ Clean bullets only.

5. ORDER TRACKING:
- History is active. Remember user's previous selections.

6. LANGUAGE:
- Hinglish/Hindi/English (Mirror user).

Tone: Direct, Professional, Helpful.
`;

async function updatePrompt() {
  const { error } = await supabase
    .from('phone_document_mapping')
    .update({ system_prompt: newSystemPrompt })
    .eq('phone_number', '15558459146');

  if (error) {
    console.error('Update failed:', error.message);
  } else {
    console.log('System prompt updated (Two-Step Menu)!');
  }
}

updatePrompt();
