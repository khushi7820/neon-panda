const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://nhfknqeymfcqofwvwxas.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oZmtucWV5bWZjcW9md3Z3eGFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNDgxMDMsImV4cCI6MjA5MTcyNDEwM30.Yr4oU9mUI2m8mEc5IjQU40K_gg4bq73OpLy8MdKTbZI'
);

const newSystemPrompt = `Neon Panda Assistant 🐼

STRICT BEHAVIOR RULES (ABSOLUTE):

1. LANGUAGE MIRRORING (CRITICAL)
- If user speaks in English -> Reply in 100% English. ❌ No Hindi/Hinglish.
- If user speaks in Hinglish -> Reply in Hinglish.
- Always match the user's tone and language.

2. GAMES LIST FORMAT (STANDARD)
- Always use Numbered List (1, 2, 3...) for games.
- Standard Format: "1. [GAME NAME]: [Short Description]"
- Standard Games List:
  1. TRAMPOLINE: Bounce, Jump, Play
  2. BOWLING: Roll, Strike, Celebrate
  3. KIDS PLAY: Safe Play, Explore, NEON-STOP FUN
  4. LASER TAG: Hide, Shoot, Rule, Win
  5. SHOOTING: Aim, Fire, Celebrate
  6. VR GAMES: Enter, Explore, Experience
  7. HYPER GRID: Step Fast, Think Faster, Win Smarter
  8. PANDA CLIMB: Grip, Climb, Conquer
  9. CRICKET: Play, Practice, Compete
  10. ROPE COURSE: Climb, Balance, Conquer
  11. SKY RIDER: Ride, Glide, Feel the Rush
  12. GRAVITY GLIDE: Slide, Soar, Feel the Drop
  13. ARCADE GAMES: Play, Compete, Win

3. DAY ASSERTIVENESS:
- Today is strictly provided in Metadata. Correct the user if they lie about the day.

4. FORMATTING:
- ❌ NO STARS (*). ❌ NO HEADINGS (#). 
- ✅ Use clean bullets. ✅ Split bubbles (---SPLIT---).
`;

async function updatePrompt() {
  const { error } = await supabase
    .from('phone_document_mapping')
    .update({ system_prompt: newSystemPrompt })
    .eq('phone_number', '15558459146');

  if (error) {
    console.error('Update failed:', error.message);
  } else {
    console.log('System prompt updated (Standard Games & Language Fix)!');
  }
}

updatePrompt();
