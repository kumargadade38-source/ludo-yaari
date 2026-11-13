import React from 'react';
import { Trophy, RotateCcw, Home } from 'lucide-react';
import { COLOR_THEMES } from '../engine/boardGeometry';
import { PlayerSeat } from '../types/ludo';

interface VictoryModalProps {
  seats: PlayerSeat[];
  winnerOrder: number[];
  isOnlineGuest: boolean;
  onPlayAgain: () => void;
  onBackToLobby: () => void;
}

export const VictoryModal: React.FC<VictoryModalProps> = ({
  seats,
  winnerOrder,
  isOnlineGuest,
  onPlayAgain,
  onBackToLobby,
}) => {
  const orderedSeats = winnerOrder
    .map((seatIdx) => seats[seatIdx])
    .filter((s): s is PlayerSeat => Boolean(s && s.type !== 'empty'));

  const eliminatedSeats = seats.filter(
    (s) => s.type !== 'empty' && s.eliminated && !winnerOrder.includes(s.seatIndex)
  );
  const allStandings = [...orderedSeats, ...eliminatedSeats];

  const winner = orderedSeats[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#07051F]/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl bg-gradient-to-b from-[#25216B] to-[#17144A] border border-indigo-300/30 shadow-[0_24px_60px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.2)] p-6 text-white">
        <div className="flex flex-col items-center text-center mb-5">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-b from-amber-300 via-amber-400 to-orange-500 text-stone-950 flex items-center justify-center mb-3 border border-amber-200 shadow-lg">
            <Trophy className="w-8 h-8" />
          </div>
          <h2 className="font-display text-2xl font-black text-amber-300 tracking-tight">
            {winner ? `${winner.name} Wins!` : 'Match Finished'}
          </h2>
          <p className="text-xs text-indigo-200/80 mt-1">
            Final standings · Match complete
          </p>
        </div>

        <div className="space-y-2 mb-6">
          {allStandings.map((seat, idx) => {
            const theme = COLOR_THEMES[seat.color];
            const isElim = Boolean(seat.eliminated);
            const placeLabel = isElim
              ? 'OUT'
              : idx === 0
              ? '1st'
              : idx === 1
              ? '2nd'
              : idx === 2
              ? '3rd'
              : '4th';
            return (
              <div
                key={seat.seatIndex}
                className="flex items-center justify-between px-4 py-3 rounded-xl border border-indigo-300/20 bg-[#120F3F]/90"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`w-9 h-8 rounded-lg flex items-center justify-center text-xs font-extrabold shrink-0 ${
                      isElim
                        ? 'bg-rose-950/90 text-rose-300 border border-rose-400/30'
                        : idx === 0
                        ? 'bg-gradient-to-b from-amber-300 to-orange-500 text-stone-950'
                        : 'bg-indigo-900/80 text-indigo-100 border border-indigo-400/20'
                    }`}
                  >
                    {placeLabel}
                  </span>
                  <span
                    className="w-3 h-3 rounded-full shrink-0 ring-2 ring-white/40"
                    style={{ backgroundColor: theme.primary }}
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-white truncate">
                      {seat.name}
                    </div>
                    <div className="text-[11px] text-indigo-200/75 font-mono-id">
                      {seat.type === 'bot' ? 'Computer' : isElim ? `ID: ${seat.id} · Eliminated` : `ID: ${seat.id}`}
                    </div>
                  </div>
                </div>
                <span className="text-xs font-semibold text-indigo-200 shrink-0">
                  {theme.name}
                </span>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBackToLobby}
            className="flex-1 h-12 rounded-xl border border-indigo-300/30 bg-[#1D195A] text-indigo-100 text-sm font-bold flex items-center justify-center gap-2 hover:bg-[#272273] active:scale-[0.98] transition-all cursor-pointer"
          >
            <Home className="w-4 h-4" />
            <span>Lobby</span>
          </button>
          {!isOnlineGuest && (
            <button
              type="button"
              onClick={onPlayAgain}
              className="flex-1 h-12 rounded-xl bg-gradient-to-b from-emerald-400 via-emerald-500 to-emerald-600 border-b-4 border-emerald-800 text-white text-sm font-extrabold flex items-center justify-center gap-2 hover:brightness-105 active:scale-[0.98] transition-all cursor-pointer shadow-lg"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Play Again</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
