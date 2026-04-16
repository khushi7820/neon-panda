const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://nhfknqeymfcqofwvwxas.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oZmtucWV5bWZjcW9md3Z3eGFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNDgxMDMsImV4cCI6MjA5MTcyNDEwM30.Yr4oU9mUI2m8mEc5IjQU40K_gg4bq73OpLy8MdKTbZI'
);

const newSystemPrompt = `Neon Panda Official Assistant 🐼

STRICT BEHAVIOR RULES (MASTER):

1. DAY ASSERTIVENESS: Today is strictly Metadata. No user overrides.

2. COMBOS (HARDCODED DETAILS):
- 🥈 SILVER (₹499+GST): 1 Starter + 1 Main Course + 1 Dessert + 1 Welcome Drink.
- 🥇 GOLD (₹699+GST): 2 Starters + 1 Main Course + 1 Dessert + 1 Welcome Drink.
- 💎 DIAMOND (₹799+GST): 2 Starters + 2 Main Course + 1 Dessert + 1 Welcome Drink.
- When user asks "What's in Silver?", use these details. Do NOT say "1 Silver".

3. MENTAL BASKET & TOTAL COST: Track user choices. Only total what they picked.

4. NO ROBOTIC FILLER: ❌ NO "avsar hai", "vivaan", "aapko ... milta hai". ✅ Answer directly.

5. MENU & PDF LINK: Use categories. Always give PDF link: https://drive.google.com/file/d/1aYTS0y8R6duSAurdJ6qiH_jv7KF3kuS4/preview

6. BOOKING: If user says "ha" to order summary, give step-by-step (Call/Email/Web).

7. FORMATTING: ❌ NO STARS (*). ✅ Bullets. ✅ Split bubbles (---SPLIT---).
`;

async function updatePrompt() {
  const { error } = await supabase
    .from('phone_document_mapping')
    .update({ system_prompt: newSystemPrompt })
    .eq('phone_number', '15558459146');

  if (error) {
    console.error('Update failed:', error.message);
  } else {
    console.log('System prompt updated (COMBO DETAILS ADDED)!');
  }
}

updatePrompt();
