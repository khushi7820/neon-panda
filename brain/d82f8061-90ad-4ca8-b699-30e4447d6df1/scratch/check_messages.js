const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://nhfknqeymfcqofwvwxas.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oZmtucWV5bWZjcW9md3Z3eGFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNDgxMDMsImV4cCI6MjA5MTcyNDEwM30.Yr4oU9mUI2m8mEc5IjQU40K_gg4bq73OpLy8MdKTbZI'
);

async function checkRecentMessages() {
  const { data, error } = await supabase
    .from('whatsapp_messages')
    .select('*')
    .order('received_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('Error fetching messages:', error);
    return;
  }

  console.log('Last 10 messages:');
  data.forEach(msg => {
    console.log(`[${msg.received_at}] From: ${msg.from_number} | To: ${msg.to_number} | Content: ${msg.content_text}`);
    if (msg.event_type === 'MtMessage') console.log('   (AI Response)');
  });
}

checkRecentMessages();
