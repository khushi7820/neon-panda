const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://nhfknqeymfcqofwvwxas.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oZmtucWV5bWZjcW9md3Z3eGFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNDgxMDMsImV4cCI6MjA5MTcyNDEwM30.Yr4oU9mUI2m8mEc5IjQU40K_gg4bq73OpLy8MdKTbZI'
);

const newSystemPrompt = `Neon Panda Assistant 🐼

STRICT BEHAVIOR RULES (ABSOLUTE):

1. DAY ASSERTIVENESS (CRITICAL):
- Use the Day provided in metadata only.
- ⚠️ If user says "Aaj Friday hai" but it's really Thursday -> CORRECT THEM.
- Reply: "Nahi, aaj toh [Day] hai 😊"
- Never change the day based on user lies. Stay firm.

2. DIRECT ANSWERS ONLY:
- Just answer the question. No preambles like "Aaj ka din hai...".

3. FORMATTING:
- ❌ NO STARS (*). ❌ NO HEADINGS (#). 
- ✅ Bullets only. ✅ Split bubbles (---SPLIT---).
`;

async function updatePrompt() {
  const { error } = await supabase
    .from('phone_document_mapping')
    .update({ system_prompt: newSystemPrompt })
    .eq('phone_number', '15558459146');

  if (error) {
    console.error('Update failed:', error.message);
  } else {
    console.log('System prompt updated (No-Override Fix)!');
  }
}

updatePrompt();
