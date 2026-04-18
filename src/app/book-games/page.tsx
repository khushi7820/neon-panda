'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

const GAMES = [
  { id: 'trampoline', name: 'Trampoline', emoji: '🤸', price: 299 },
  { id: 'bowling', name: 'Bowling', emoji: '🎳', price: 299 },
  { id: 'kids_play', name: 'Kids Play', emoji: '🧸', price: 299 },
  { id: 'laser_tag', name: 'Laser Tag', emoji: '🔫', price: 299 },
  { id: 'shooting', name: 'Shooting', emoji: '🎯', price: 299 },
  { id: 'arcade', name: 'Arcade Games', emoji: '🕹️', price: 299 },
  { id: 'vr', name: 'VR Games', emoji: '🕶️', price: 399 },
  { id: 'hyper_grid', name: 'Hyper Grid', emoji: '⚡', price: 299 },
  { id: 'panda_climb', name: 'Panda Climb', emoji: '🧗', price: 299 },
  { id: 'cricket', name: 'Cricket', emoji: '🏏', price: 299 },
  { id: 'rope_course', name: 'Rope Course', emoji: '🪢', price: 299 },
  { id: 'sky_rider', name: 'Sky Rider', emoji: '🚁', price: 299 },
  { id: 'gravity_glide', name: 'Gravity Glide', emoji: '🛝', price: 299 },
];

const TIME_SLOTS = [
  '10:00 AM', '11:00 AM', '12:00 PM', '1:00 PM',
  '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM',
  '6:00 PM', '7:00 PM', '8:00 PM', '9:00 PM'
];

// Day-wise offers
const DAILY_OFFERS: Record<string, {
  name: string;
  price: number;
  description: string;
  emoji: string;
  includedGames: string[];
}> = {
  Monday: {
    name: 'Panda Kickstart',
    price: 199,
    description: 'Arcade + Indoor Games',
    emoji: '🎮',
    includedGames: ['arcade', 'hyper_grid']
  },
  Tuesday: {
    name: 'Turbo Tuesday VR',
    price: 249,
    description: 'VR Experience Special',
    emoji: '🕶️',
    includedGames: ['vr']
  },
  Wednesday: {
    name: 'Midweek Madness',
    price: 249,
    description: 'Bowling Special',
    emoji: '🎳',
    includedGames: ['bowling']
  },
  Thursday: {
    name: 'Throwdown Thursday',
    price: 199,
    description: 'Multiplayer Games',
    emoji: '🎮',
    includedGames: ['arcade', 'hyper_grid']
  },
  Friday: {
    name: 'Panda Face-Off',
    price: 199,
    description: 'Live Game Night',
    emoji: '🔥',
    includedGames: ['laser_tag']
  },
  Saturday: {
    name: 'Super Saturday',
    price: 499,
    description: 'Combo Pricing (Bowling + Trampoline + Arcade)',
    emoji: '🎉',
    includedGames: ['bowling', 'trampoline', 'arcade']
  },
  Sunday: {
    name: 'Family Fun Day',
    price: 999,
    description: 'Family Pack (4 people)',
    emoji: '👨‍👩‍👧‍👦',
    includedGames: ['trampoline', 'bowling', 'kids_play', 'arcade']
  },
};

function getTodayDay(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    timeZone: 'Asia/Kolkata'
  });
}

function BookingForm() {
  const searchParams = useSearchParams();

  // Store original selections from URL (for change detection)
  const [originalGames, setOriginalGames] = useState<string[]>([]);

  const [selectedGames, setSelectedGames] = useState<string[]>([]);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [players, setPlayers] = useState(1);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [applyOffer, setApplyOffer] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<any>(null);
  const [error, setError] = useState('');

  const today = new Date().toISOString().split('T')[0];
  const todayDay = getTodayDay();
  const todayOffer = DAILY_OFFERS[todayDay];

  // Pre-select from URL params
  useEffect(() => {
    const gamesParam = searchParams.get('games');
    if (gamesParam) {
      const preSelected = gamesParam.split(',').filter(g =>
        GAMES.some(game => game.id === g)
      );
      if (preSelected.length > 0) {
        setSelectedGames(preSelected);
        setOriginalGames(preSelected);
      }
    }
  }, [searchParams]);

  // Calculate prices
  const regularPrice = selectedGames.reduce((sum, id) => {
    const game = GAMES.find(g => g.id === id);
    return sum + (game?.price || 0);
  }, 0);

  let perPersonPrice = regularPrice;
  if (applyOffer && todayOffer) {
    const extraGamesPrice = selectedGames
      .filter(id => !todayOffer.includedGames.includes(id))
      .reduce((sum, id) => {
        const game = GAMES.find(g => g.id === id);
        return sum + (game?.price || 0);
      }, 0);
    perPersonPrice = todayOffer.price + extraGamesPrice;
  }

  const grandTotal = perPersonPrice * players;
  // Calculate total savings by comparing what they would have paid (regularPrice) vs what they are paying (perPersonPrice)
  const savings = applyOffer && todayOffer ? (regularPrice - perPersonPrice) * players : 0;

  // Detect changes from original selection
  const hasChanges = () => {
    if (originalGames.length === 0) return false;
    if (originalGames.length !== selectedGames.length) return true;
    return !originalGames.every(g => selectedGames.includes(g));
  };

  const getChanges = () => {
    const added = selectedGames.filter(g => !originalGames.includes(g));
    const removed = originalGames.filter(g => !selectedGames.includes(g));
    return { added, removed };
  };

  const toggleGame = (id: string) => {
    setSelectedGames(prev =>
      prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id]
    );
  };

  const handleApplyOffer = (checked: boolean) => {
    setApplyOffer(checked);
    if (checked && todayOffer && todayOffer.includedGames) {
      // Auto-select all games included in the offer
      setSelectedGames(prev => {
        const newSet = new Set([...prev, ...todayOffer.includedGames]);
        return Array.from(newSet);
      });
    }
  };

  const handleSubmit = async () => {
    setError('');

    if (selectedGames.length === 0) { setError('Please select at least 1 game'); return; }
    if (!date) { setError('Please select date'); return; }
    if (!time) { setError('Please select time slot'); return; }
    if (!name.trim()) { setError('Please enter your name'); return; }
    if (!/^\d{10}$/.test(phone)) { setError('Please enter valid 10-digit phone'); return; }

    setLoading(true);
    try {
      const selectedGameDetails = GAMES.filter(g => selectedGames.includes(g.id));
      const changes = hasChanges() ? getChanges() : null;

      const response = await fetch('/api/submit-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          games: selectedGameDetails,
          date,
          time,
          players,
          name: name.trim(),
          phone: phone.trim(),
          perPersonPrice,
          total: grandTotal,
          offerApplied: applyOffer,
          offerName: applyOffer && todayOffer ? todayOffer.name : null,
          savings,
          changes: changes ? {
            added: changes.added.map(id => GAMES.find(g => g.id === id)?.name).filter(Boolean),
            removed: changes.removed.map(id => GAMES.find(g => g.id === id)?.name).filter(Boolean)
          } : null,
          originalGames: originalGames.length > 0 ? originalGames.map(id => GAMES.find(g => g.id === id)?.name).filter(Boolean) : null
        })
      });

      const data = await response.json();

      if (data.success) {
        setSuccess(data);
      } else {
        setError(data.error || 'Booking failed. Please try again.');
      }
    } catch (err: any) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // SUCCESS SCREEN
  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-8 max-w-md w-full text-center shadow-2xl">
          <div className="text-7xl mb-4">🎉</div>
          <h1 className="text-3xl font-bold text-green-600 mb-3">Booking Confirmed!</h1>
          <p className="text-gray-600 mb-6">
            Confirmation WhatsApp pe bhej di hai!<br />
            <span className="font-semibold">Booking ID: #{success.bookingId}</span>
          </p>

          <div className="bg-purple-50 rounded-xl p-4 mb-4 text-left space-y-1">
            <p className="text-sm"><b>📅 Date:</b> {date}</p>
            <p className="text-sm"><b>⏰ Time:</b> {time}</p>
            <p className="text-sm"><b>👥 Players:</b> {players}</p>
            <p className="text-sm"><b>💰 Total:</b> ₹{grandTotal}</p>
            {applyOffer && (
              <p className="text-xs text-orange-700 bg-orange-100 p-2 rounded mt-2">
                ✨ Offer Applied: {todayOffer?.name} (Saved ₹{savings})
              </p>
            )}
          </div>

          <p className="text-4xl mb-2">🐼</p>
          <p className="text-sm text-gray-500">See you at Neon Panda!</p>

          <button
            onClick={() => window.location.href = '/book-games'}
            className="mt-6 text-purple-600 underline text-sm"
          >
            Book Another
          </button>
        </div>
      </div>
    );
  }

  // MAIN FORM
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400 py-8 px-4">
      <div className="max-w-2xl mx-auto">

        <div className="text-center mb-6">
          <h1 className="text-5xl font-bold text-white mb-2">🐼 Neon Panda</h1>
          <p className="text-white/90 text-lg">Book Your Gaming Slot</p>
        </div>

        <div className="bg-white rounded-3xl p-6 shadow-2xl space-y-6">

          {/* Pre-selected notice */}
          {originalGames.length > 0 && (
            <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-3 text-sm">
              <p className="font-medium text-blue-800">
                💬 {originalGames.length} games pre-selected from chat
              </p>
              <p className="text-xs text-blue-600 mt-1">
                You can modify your selection anytime before submitting
              </p>
            </div>
          )}

          {/* Games Selection */}
          <div>
            <label className="font-bold text-gray-800 mb-3 block text-lg">
              🎮 Select Games
            </label>
            <p className="text-xs text-gray-500 mb-3">Pick one or more games</p>
            <div className="grid grid-cols-2 gap-2">
              {GAMES.map(game => (
                <button
                  key={game.id}
                  onClick={() => toggleGame(game.id)}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${selectedGames.includes(game.id)
                      ? 'border-purple-600 bg-purple-50 shadow-md'
                      : 'border-gray-200 hover:border-purple-300'
                    }`}
                >
                  <div className="font-medium text-sm">{game.emoji} {game.name}</div>
                  <div className="text-xs text-gray-600 mt-1">₹{game.price}/person</div>
                </button>
              ))}
            </div>

            {/* Changes indicator */}
            {hasChanges() && (
              <div className="mt-3 bg-yellow-50 border-2 border-yellow-300 rounded-xl p-3 text-sm">
                <p className="font-medium text-yellow-800">✏️ You modified the selection:</p>
                {getChanges().added.length > 0 && (
                  <p className="text-green-700 text-xs mt-1">
                    + Added: {getChanges().added.map(id => GAMES.find(g => g.id === id)?.name).join(', ')}
                  </p>
                )}
                {getChanges().removed.length > 0 && (
                  <p className="text-red-700 text-xs mt-1">
                    - Removed: {getChanges().removed.map(id => GAMES.find(g => g.id === id)?.name).join(', ')}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Today's Offer */}
          {todayOffer && selectedGames.length > 0 && (
            <div className={`rounded-xl p-4 border-2 transition-all ${applyOffer
                ? 'bg-gradient-to-r from-orange-100 to-yellow-100 border-orange-400 shadow-md'
                : 'bg-gray-50 border-gray-200'
              }`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="font-bold text-orange-900 text-lg">
                    {todayOffer.emoji} Today's Special: {todayOffer.name}
                  </div>
                  <div className="text-sm text-orange-800 mt-1">
                    {todayOffer.description}
                  </div>
                  <div className="text-xl font-bold text-orange-900 mt-2">
                    ₹{todayOffer.price}/person
                    {regularPrice > todayOffer.price && (
                      <span className="text-sm font-normal text-gray-500 line-through ml-2">
                        ₹{regularPrice}
                      </span>
                    )}
                  </div>
                  {applyOffer && savings > 0 && (
                    <div className="text-xs text-green-700 font-bold mt-1">
                      💰 You save ₹{savings} total!
                    </div>
                  )}
                </div>
                <label className="flex items-center gap-2 cursor-pointer bg-white px-3 py-2 rounded-lg shadow">
                  <input
                    type="checkbox"
                    checked={applyOffer}
                    onChange={(e) => handleApplyOffer(e.target.checked)}
                    className="w-5 h-5 accent-orange-600"
                  />
                  <span className="font-bold text-orange-800 text-sm">Apply</span>
                </label>
              </div>
            </div>
          )}

          {/* Date */}
          <div>
            <label className="font-bold text-gray-800 mb-2 block">📅 Date</label>
            <input
              type="date"
              value={date}
              min={today}
              onChange={(e) => setDate(e.target.value)}
              className="w-full p-3 border-2 border-gray-200 rounded-xl focus:border-purple-600 outline-none"
            />
          </div>

          {/* Time Slot */}
          <div>
            <label className="font-bold text-gray-800 mb-2 block">⏰ Time Slot</label>
            <div className="grid grid-cols-4 gap-2">
              {TIME_SLOTS.map(slot => (
                <button
                  key={slot}
                  onClick={() => setTime(slot)}
                  className={`p-2 rounded-lg border-2 text-xs font-medium transition ${time === slot
                      ? 'border-purple-600 bg-purple-50 text-purple-700'
                      : 'border-gray-200 hover:border-purple-300'
                    }`}
                >
                  {slot}
                </button>
              ))}
            </div>
          </div>

          {/* Players */}
          <div>
            <label className="font-bold text-gray-800 mb-2 block">👥 Players</label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setPlayers(Math.max(1, players - 1))}
                className="w-10 h-10 bg-gray-100 rounded-lg font-bold hover:bg-gray-200"
              >-</button>
              <input
                type="number"
                min="1"
                max="20"
                value={players}
                onChange={(e) => setPlayers(Math.max(1, parseInt(e.target.value) || 1))}
                className="flex-1 p-3 border-2 border-gray-200 rounded-xl text-center font-bold outline-none focus:border-purple-600"
              />
              <button
                onClick={() => setPlayers(Math.min(20, players + 1))}
                className="w-10 h-10 bg-gray-100 rounded-lg font-bold hover:bg-gray-200"
              >+</button>
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="font-bold text-gray-800 mb-2 block">👤 Your Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name"
              className="w-full p-3 border-2 border-gray-200 rounded-xl outline-none focus:border-purple-600"
            />
          </div>

          {/* Phone */}
          <div>
            <label className="font-bold text-gray-800 mb-2 block">📱 WhatsApp Number</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
              placeholder="10-digit number"
              className="w-full p-3 border-2 border-gray-200 rounded-xl outline-none focus:border-purple-600"
            />
            <p className="text-xs text-gray-500 mt-1">Confirmation WhatsApp pe aayegi</p>
          </div>

          {/* Total */}
          {selectedGames.length > 0 && (
            <div className="bg-gradient-to-r from-purple-600 to-pink-500 text-white p-4 rounded-xl">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm opacity-90">Per person:</span>
                <span className="font-bold">₹{perPersonPrice}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-bold">Total ({players} players):</span>
                <span className="text-2xl font-bold">₹{grandTotal}</span>
              </div>
              {applyOffer && savings > 0 && (
                <div className="text-xs text-green-200 mt-2 text-center">
                  ✨ Offer saved you ₹{savings}!
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="bg-red-50 border-2 border-red-200 text-red-700 p-3 rounded-xl text-sm">
              ⚠️ {error}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full bg-gradient-to-r from-purple-600 to-pink-500 text-white font-bold py-4 rounded-xl hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {loading ? '⏳ Booking...' : '🎉 Confirm Booking'}
          </button>

          <p className="text-xs text-center text-gray-500">
            📍 Neon Panda, Phoenix Citadel Mall, Indore
          </p>
        </div>
      </div>
    </div>
  );
}

export default function BookGamesPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-purple-600 flex items-center justify-center text-white text-xl">Loading...</div>}>
      <BookingForm />
    </Suspense>
  );
}