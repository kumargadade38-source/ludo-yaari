import React, { useEffect, useState } from 'react';
import { Loader2, WifiOff, Clock } from 'lucide-react';
import { COLOR_THEMES } from '../engine/boardGeometry';
import { PlayerSeat, TurnPhase } from '../types/ludo';

interface DiceControlProps {
  diceValue: number | null;
  isRolling: boolean;
  canRoll: boolean;
  activeSeat: PlayerSeat;
  phase: TurnPhase;
  isMyTurn: boolean;
  isOnlineMode?: boolean;
  secondsLeft?: number | null;
  turnTotalSeconds?: number;
  localReconnecting?: boolean;
  onRoll: () => void;
}

const PIP_POSITIONS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

export const DiceControl: React.FC<DiceControlProps> = ({
  diceValue,
  isRolling,
  canRoll,
  activeSeat,
  phase,
  isMyTurn,
  isOnlineMode = false,
  secondsLeft = null,
  turnTotalSeconds = 30,
  localReconnecting = false,
  onRoll,
}) => {
  const theme = COLOR_THEMES[activeSeat.color];
  const [tumbleFace, setTumbleFace] = useState<number>(6);

  // Cycle visible pip faces rapidly during 3D roll animation
  useEffect(() => {
    if (!isRolling) return;
    const id = window.setInterval(() => {
      setTumbleFace((prev) => ((prev + Math.floor(Math.random() * 5)) % 6) + 1);
    }, 65);
    return () => window.clearInterval(id);
  }, [isRolling]);

  const shownValue = isRolling ? tumbleFace : diceValue ?? 6;
  const pips = PIP_POSITIONS[shownValue] || PIP_POSITIONS[6];

  const showTimer =
    isOnlineMode &&
    phase !== 'GAME_OVER' &&
    activeSeat.type === 'human' &&
    secondsLeft !== null;

  const clampedSeconds = Math.max(0, Math.min(turnTotalSeconds, secondsLeft ?? turnTotalSeconds));
  const progressRatio = turnTotalSeconds > 0 ? clampedSeconds / turnTotalSeconds : 0;
  const isLowTime = clampedSeconds <= 5;
  const isWarningTime = clampedSeconds <= 10 && !isLowTime;

  const timerStrokeColor = isLowTime
    ? '#FB7185'
    : isWarningTime
    ? '#FBBF24'
    : '#34D399';

  const strikes = activeSeat.strikes ?? 0;
  const showAutoBotStatus =
    isOnlineMode &&
    activeSeat.type === 'human' &&
    !activeSeat.eliminated &&
    (activeSeat.autoBotActive || !activeSeat.connected || strikes > 0);

  const autoBotLabel =
    strikes > 0
      ? `${activeSeat.name} reconnecting... Auto-Bot ${Math.min(3, strikes)}/3`
      : `${activeSeat.name} reconnecting...`;

  const renderCompactRing = (sizePx: number) => {
    if (!showTimer) return null;
    const radius = 14;
    const circumference = 2 * Math.PI * radius;
    const dashOffset = circumference * (1 - progressRatio);
    return (
      <div
        className="relative inline-flex items-center justify-center shrink-0"
        style={{ width: sizePx, height: sizePx }}
        aria-label={`${clampedSeconds} seconds remaining`}
      >
        <svg viewBox="0 0 34 34" className="w-full h-full -rotate-90">
          <circle
            cx="17"
            cy="17"
            r={radius}
            fill="rgba(15, 23, 42, 0.65)"
            stroke="rgba(148, 163, 184, 0.25)"
            strokeWidth="3"
          />
          <circle
            cx="17"
            cy="17"
            r={radius}
            fill="none"
            stroke={timerStrokeColor}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            className="transition-[stroke-dashoffset] duration-200 linear"
          />
        </svg>
        <span
          className={`absolute font-mono-id text-[10px] font-extrabold leading-none ${
            isLowTime ? 'text-rose-300 animate-pulse' : 'text-white'
          }`}
        >
          {clampedSeconds}
        </span>
      </div>
    );
  };

  // When it is NOT the local player's turn, hide the center dice and show waiting state
  if (!isMyTurn || phase === 'GAME_OVER') {
    return (
      <div className="min-h-[120px] flex flex-col items-center justify-center text-center px-4 py-2 select-none">
        <div
          className={`inline-flex items-center gap-2.5 px-4 py-2 rounded-2xl bg-[#1C1859]/90 border shadow-lg ${
            isLowTime && showTimer
              ? 'border-rose-400/70'
              : isWarningTime && showTimer
              ? 'border-amber-400/60'
              : 'border-indigo-300/25'
          }`}
        >
          <span
            className="w-3.5 h-3.5 rounded-full shrink-0 ring-2 ring-white/40"
            style={{ backgroundColor: theme.primary }}
            aria-hidden="true"
          />
          <span className="text-sm font-bold text-white">
            {phase === 'GAME_OVER'
              ? 'Match Complete'
              : `Waiting for ${activeSeat.name}'s turn...`}
          </span>
          {showTimer ? (
            renderCompactRing(30)
          ) : (
            phase !== 'GAME_OVER' && (
              <Loader2 className="w-4 h-4 text-amber-300 animate-spin shrink-0" />
            )
          )}
        </div>

        {showAutoBotStatus && phase !== 'GAME_OVER' && (
          <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-950/75 border border-amber-400/45 text-[11px] font-bold text-amber-200 shadow-sm">
            <WifiOff className="w-3.5 h-3.5 text-amber-300 shrink-0" />
            <span>{autoBotLabel}</span>
          </div>
        )}

        {localReconnecting && phase !== 'GAME_OVER' && (
          <div className="mt-1.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-950/75 border border-rose-400/45 text-[11px] font-bold text-rose-200">
            <Loader2 className="w-3 h-3 animate-spin shrink-0" />
            <span>Connection lost · Reconnecting in background...</span>
          </div>
        )}

        {phase === 'WAIT_MOVE' && diceValue !== null && (
          <p className="mt-1.5 text-xs font-semibold text-indigo-200/85">
            {activeSeat.name} rolled {diceValue}
          </p>
        )}
      </div>
    );
  }

  const getTurnHint = () => {
    if (isRolling) return 'Rolling...';
    if (phase === 'WAIT_MOVE' && diceValue !== null) {
      return `Rolled ${diceValue} · Tap a glowing token`;
    }
    return 'Tap dice to roll';
  };

  // Perimeter ring around the 3D dice button for active local player
  const boxCircumference = 340;
  const boxDashOffset = boxCircumference * (1 - progressRatio);

  return (
    <div className="min-h-[120px] flex flex-col items-center justify-center text-center py-1 select-none">
      {/* Large Centered 3D Glossy Dice with 30s Countdown Ring */}
      <div className="dice-perspective relative inline-flex items-center justify-center p-1.5">
        {showTimer && (
          <svg
            viewBox="0 0 100 100"
            className="pointer-events-none absolute inset-0 w-full h-full"
            aria-hidden="true"
          >
            <rect
              x="2.5"
              y="2.5"
              width="95"
              height="95"
              rx="25"
              fill="none"
              stroke="rgba(255,255,255,0.16)"
              strokeWidth="4"
            />
            <rect
              x="2.5"
              y="2.5"
              width="95"
              height="95"
              rx="25"
              fill="none"
              stroke={timerStrokeColor}
              strokeWidth="4.2"
              strokeLinecap="round"
              strokeDasharray={boxCircumference}
              strokeDashoffset={boxDashOffset}
              className="transition-[stroke-dashoffset] duration-200 linear"
            />
          </svg>
        )}

        <button
          type="button"
          onClick={onRoll}
          disabled={!canRoll}
          aria-label={canRoll ? 'Roll 3D Dice' : `Rolled ${shownValue}`}
          className={`relative group rounded-[22px] p-1.5 transition-all duration-150 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-300/50 ${
            canRoll
              ? 'cursor-pointer active:scale-95 hover:scale-[1.04]'
              : 'cursor-default'
          }`}
          style={{
            background: `linear-gradient(145deg, ${theme.light}, ${theme.primary})`,
            boxShadow: canRoll
              ? `0 10px 28px -4px ${theme.primary}AA, 0 0 18px rgba(255,255,255,0.22)`
              : '0 6px 16px -4px rgba(0,0,0,0.45)',
          }}
        >
          {/* Glossy 3D Ivory Cube */}
          <div
            className={`relative w-[68px] h-[68px] sm:w-[74px] sm:h-[74px] rounded-[16px] p-2.5 grid grid-cols-3 grid-rows-3 gap-1 place-items-center ${
              isRolling ? 'animate-dice-roll-3d' : phase === 'WAIT_MOVE' ? 'animate-dice-settle' : ''
            }`}
            style={{
              background: 'linear-gradient(155deg, #FFFFFF 0%, #F8FAFC 52%, #E2E8F0 100%)',
              boxShadow:
                'inset 0 2px 3px rgba(255,255,255,0.98), inset 0 -4px 6px rgba(15,23,42,0.14), 0 3px 0 #CBD5E1, 0 5px 10px rgba(0,0,0,0.35)',
            }}
          >
            {/* Top-left specular glossy highlight */}
            <span
              className="pointer-events-none absolute top-1 left-1 right-1 h-[42%] rounded-t-[12px]"
              style={{
                background:
                  'linear-gradient(180deg, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0) 100%)',
              }}
              aria-hidden="true"
            />

            {Array.from({ length: 9 }).map((_, idx) => {
              const active = pips.includes(idx);
              const isCenterOne = shownValue === 1 && idx === 4;
              const isSixPip = shownValue === 6;
              return (
                <span
                  key={idx}
                  className={`relative z-10 rounded-full transition-all duration-75 ${
                    isCenterOne ? 'w-3.5 h-3.5' : 'w-2.5 h-2.5 sm:w-3 sm:h-3'
                  } ${active ? 'opacity-100 scale-100' : 'opacity-0 scale-50'}`}
                  style={{
                    background: active
                      ? isCenterOne || isSixPip
                        ? 'radial-gradient(circle at 35% 35%, #FB7185, #E11D48 65%, #9F1239 100%)'
                        : 'radial-gradient(circle at 35% 35%, #44403C, #1C1917 70%, #0C0A09 100%)'
                      : 'transparent',
                    boxShadow: active
                      ? 'inset 0 1.5px 2px rgba(0,0,0,0.45), 0 1px 0 rgba(255,255,255,0.7)'
                      : 'none',
                  }}
                />
              );
            })}
          </div>
        </button>
      </div>

      {/* Active Player Name + Countdown Pill Directly Underneath the Dice */}
      <div className="mt-1.5 flex flex-col items-center">
        <div className="flex items-center gap-2">
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0 ring-2 ring-white/50"
            style={{ backgroundColor: theme.primary }}
            aria-hidden="true"
          />
          <span className="font-display text-base font-extrabold text-white tracking-tight leading-tight drop-shadow-xs">
            {activeSeat.name}
          </span>
          {showTimer && (
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-mono-id text-[11px] font-extrabold border ${
                isLowTime
                  ? 'bg-rose-950/90 border-rose-400 text-rose-200 animate-pulse'
                  : isWarningTime
                  ? 'bg-amber-950/90 border-amber-400 text-amber-200'
                  : 'bg-[#17134A]/90 border-emerald-400/50 text-emerald-200'
              }`}
            >
              <Clock className="w-3 h-3" />
              <span>{clampedSeconds}s</span>
            </span>
          )}
        </div>

        {showAutoBotStatus && (
          <span className="mt-1 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-950/80 border border-amber-400/45 text-[10px] font-bold text-amber-200">
            <WifiOff className="w-3 h-3 shrink-0" />
            <span>{autoBotLabel}</span>
          </span>
        )}

        {localReconnecting && (
          <span className="mt-1 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-950/80 border border-rose-400/45 text-[10px] font-bold text-rose-200">
            <Loader2 className="w-3 h-3 animate-spin shrink-0" />
            <span>Reconnecting in background...</span>
          </span>
        )}

        <span className="text-[11px] font-semibold text-amber-200/90 mt-0.5">
          {getTurnHint()}
        </span>
      </div>
    </div>
  );
};
