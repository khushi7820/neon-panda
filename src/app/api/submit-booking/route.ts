import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import { sendWhatsAppMessage } from '@/lib/whatsappSender';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      games, date, time, players, name, phone,
      perPersonPrice, total, offerApplied, offerName, savings, changes
    } = body;

    if (!games?.length || !date || !time || !name || !phone || !players) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const formattedPhone = phone.startsWith('91') ? phone : `91${phone}`;

    // Save to database
    const { data: booking, error: dbError } = await supabase
      .from('game_bookings')
      .insert({
        customer_name: name,
        customer_phone: formattedPhone,
        games: games,
        booking_date: date,
        time_slot: time,
        players: players,
        per_person_price: perPersonPrice,
        total_amount: total,
        status: 'confirmed',
        notes: offerApplied ? `Offer Applied: ${offerName} (Saved ₹${savings})` : null
      })
      .select()
      .single();

    if (dbError) {
      console.error('DB Error:', dbError);
      throw new Error('Database save failed');
    }

    // Get WhatsApp credentials
    const { data: config } = await supabase
      .from('phone_document_mapping')
      .select('auth_token, origin')
      .eq('phone_number', '15558459146')
      .single();

    if (!config?.auth_token || !config?.origin) {
      return NextResponse.json({
        success: true,
        bookingId: booking.id,
        warning: 'Booking saved but WhatsApp notification may be delayed'
      });
    }

    const gameList = games
      .map((g: any, i: number) => `${i + 1}. ${g.emoji} ${g.name} - ₹${g.price}`)
      .join('\n');

    const bookingDate = new Date(date).toLocaleDateString('en-IN', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    // Build changes section if modified
    let changesSection = '';
    if (changes && (changes.added?.length > 0 || changes.removed?.length > 0)) {
      changesSection = '\n\n✏️ Modifications from chat:\n';
      if (changes.added?.length > 0) {
        changesSection += `➕ Added: ${changes.added.join(', ')}\n`;
      }
      if (changes.removed?.length > 0) {
        changesSection += `➖ Removed: ${changes.removed.join(', ')}`;
      }
    }

    // Build offer section
    let offerSection = '';
    if (offerApplied && offerName) {
      offerSection = `\n\n🎉 Special Offer Applied:\n${offerName}\n💰 You saved: ₹${savings}`;
    }

    const confirmationMsg = `🎉 Booking Confirmed! 🐼

👤 Name: ${name}
📱 Contact: ${phone}

🎮 Games:
${gameList}${changesSection}${offerSection}

📅 Date: ${bookingDate}
⏰ Time: ${time}
👥 Players: ${players}

💰 Per person: ₹${perPersonPrice}
💰 Total: ₹${total}

📍 Neon Panda
313/1, Jhalariya, Nr. Phoenix Citadel Mall, Indore

See you soon! 🔥

Booking ID: #${booking.id}
For changes: +91 99931 27979`;

    try {
      await sendWhatsAppMessage(
        formattedPhone,
        confirmationMsg,
        config.auth_token,
        config.origin
      );
    } catch (whatsappError) {
      console.error('WhatsApp send failed:', whatsappError);
    }

    return NextResponse.json({
      success: true,
      bookingId: booking.id,
      message: 'Booking confirmed!'
    });

  } catch (error: any) {
    console.error('Booking error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Booking failed' },
      { status: 500 }
    );
  }
}