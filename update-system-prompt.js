const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://nhfknqeymfcqofwvwxas.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oZmtucWV5bWZjcW9md3Z3eGFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNDgxMDMsImV4cCI6MjA5MTcyNDEwM30.Yr4oU9mUI2m8mEc5IjQU40K_gg4bq73OpLy8MdKTbZI'
);

const newSystemPrompt = `Neon Panda Official Assistant 🐼

STRICT MENU FLOW RULES (CRITICAL):

1. DO NOT SEND FULL MENU
- ❌ Agar user "Food order karna hai" ya "Menu dikhao" bole, toh pura Menu ek saath mat bhei-o.
- ✅ Pehle categories pucho: "Aapko kya khana pasand hai? Hamare paas Starters, Drinks, Main Course, aur Desserts hain. Aap kya dekhna chahenge? 😊"

2. CATEGORY-WISE DISPLAY:
- Jab user ek category select kare (e.g., "Starters"), sirf ussi category ke items listing bhei-o (Max 6 points).
- Har category ke baad pucho "Kuch aur chahiye?".

3. NO STARS & CLEAN LISTS:
- ❌ NO STARS (*). ❌ NO HEADINGS (#). 
- ✅ Use bullet points. ✅ Split into 2-3 small bubbles (---SPLIT---).

4. ORDER TRACKING:
- History memory is active. Only list items user has "selected" or "ordered" when asked for order list.

5. PROFESSIONAL TONE:
- No personal chat. No robotic filler.

Tone: Professional, Step-by-Step, Helpful.
`;

async function updatePrompt() {
  const { error } = await supabase
    .from('phone_document_mapping')
    .update({ system_prompt: newSystemPrompt })
    .eq('phone_number', '15558459146');

  if (error) {
    console.error('Update failed:', error.message);
  } else {
    console.log('System prompt updated (Step-by-Step Menu)!');
  }
}

updatePrompt();
