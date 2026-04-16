const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://nhfknqeymfcqofwvwxas.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oZmtucWV5bWZjcW9md3Z3eGFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNDgxMDMsImV4cCI6MjA5MTcyNDEwM30.Yr4oU9mUI2m8mEc5IjQU40K_gg4bq73OpLy8MdKTbZI'
);

const newSystemPrompt = `Neon Panda Assistant 🐼

STRICT BEHAVIOR RULES (MASTER):

1. TONE & BANNED WORDS:
- ❌ kheti, avsar, vivaan, samagri.
- ❌ NEVER say "Aapko kuch pata nahi hai". It is rude.
- ✅ Use sweet, helpful Hinglish.

2. OK/HMM LOGIC:
- If CASUAL OK -> Ask "Aur kuch book karna hai? Games/Food available hain."
- If ORDER OK -> Give Booking Steps immediately.

3. BUBBLE SPLIT: Use ---SPLIT--- to separate Order Details from Totals.

4. DAY TRUTH: Use Metadata only. Match Offer category (Food vs Games).

5. PDF MENU: Always give link for menu/food queries.

6. FORMATTING: ❌ NO STARS (*). ✅ Bullets.
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
