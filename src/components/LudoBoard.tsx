import React, { useMemo } from 'react';
import { Star, ArrowRight, ArrowDown, ArrowLeft, ArrowUp, Crown, Bot, WifiOff } from 'lucide-react';
import {
  COLOR_THEMES,
  HOME_COLUMN_COORDS,
  MAIN_TRACK_COORDS,
  STAR_TRACK_INDICES,
  START_TRACK_INDEX,
  getRotationSteps,
  getTokenBoardPercent,
  rotateGridCoord,
} from '../engine/boardGeometry';
import { GameState, PlayerSeat, TokenState } from '../types/ludo';

interface LudoBoardProps {
  gameState: GameState;
  localHumanSeats: number[]; // seatIndices controlled by this device
  onTokenClick: (tokenIndex: number) => void;
}

interface PositionedToken {
  token: TokenState;
  x: number;
  y: number;
  stackIndex: number;
  stackSize: number;
}

export const LudoBoard: React.FC<LudoBoardProps> = ({
  gameState,
  localHumanSeats,
  onTokenClick,
}) => {
  const { seats, tokens, currentTurnSeat, phase, legalTokenIndices } = gameState;
  const isLocalTurn = localHumanSeats.includes(currentTurnSeat) && phase === 'WAIT_MOVE';

  // Always orient the board so the local player sits at Bottom-Left (visual corner 3)
  const viewerSeat = localHumanSeats[0] ?? 0;
  const rotationSteps = getRotationSteps(viewerSeat);

  // Maps visual corner (0: Top-Left, 1: Top-Right, 2: Bottom-Right, 3: Bottom-Left) -> canonical seatIndex
  const getCanonicalSeatForVisualCorner = (visualCorner: number): number => {
    return (visualCorner - rotationSteps + 4) % 4;
  };

  // Build map of rotated cell backgrounds for the 15x15 grid
  const trackCellStyles = useMemo(() => {
    const map = new Map<
      string,
      {
        bgColor: string;
        isStar?: boolean;
        visualStartCorner?: number;
        isYellowTile?: boolean;
      }
    >();

    MAIN_TRACK_COORDS.forEach((coord, idx) => {
      const rotated = rotateGridCoord(coord, rotationSteps);
      const key = `${rotated.row}-${rotated.col}`;
      let bgColor = '#FFFFFF';
      let visualStartCorner: number | undefined;
      let isYellowTile = false;

      for (let s = 0; s < 4; s++) {
        if (START_TRACK_INDEX[s] === idx) {
          visualStartCorner = (s + rotationSteps) % 4;
          const color = seats[s].color;
          bgColor = COLOR_THEMES[color].primary;
          isYellowTile = color === 'yellow';
        }
      }

      map.set(key, {
        bgColor,
        isStar: STAR_TRACK_INDICES.has(idx),
        visualStartCorner,
        isYellowTile,
      });
    });

    // Home columns (steps 51..55 -> indices 0..4)
    for (let s = 0; s < 4; s++) {
      const color = seats[s].color;
      const colorHex = COLOR_THEMES[color].primary;
      const lane = HOME_COLUMN_COORDS[s];
      for (let i = 0; i < 5; i++) {
        const rotated = rotateGridCoord(lane[i], rotationSteps);
        map.set(`${rotated.row}-${rotated.col}`, {
          bgColor: colorHex,
          isYellowTile: color === 'yellow',
        });
      }
    }

    return map;
  }, [seats, rotationSteps]);

  // Group active tokens by rounded visual position so stacked tokens fan out cleanly
  const positionedTokens = useMemo<PositionedToken[]>(() => {
    const activeTokens = tokens.filter((t) => {
      const s = seats[t.seatIndex];
      return s && s.type !== 'empty' && !s.eliminated;
    });
    const groups = new Map<string, { token: TokenState; x: number; y: number }[]>();

    for (const token of activeTokens) {
      const pt = getTokenBoardPercent(
        token.seatIndex,
        token.tokenIndex,
        token.step,
        viewerSeat
      );
      const key = `${pt.x.toFixed(1)}-${pt.y.toFixed(1)}`;
      const list = groups.get(key) || [];
      list.push({ token, x: pt.x, y: pt.y });
      groups.set(key, list);
    }

    const result: PositionedToken[] = [];
    for (const list of groups.values()) {
      const n = list.length;
      list.forEach((item, idx) => {
        result.push({
          token: item.token,
          x: item.x,
          y: item.y,
          stackIndex: idx,
          stackSize: n,
        });
      });
    }
    return result;
  }, [tokens, seats, viewerSeat]);

  const renderVisualYard = (
    visualCorner: number,
    posClass: string,
    headerAtBottom: boolean
  ) => {
    const canonicalSeatIndex = getCanonicalSeatForVisualCorner(visualCorner);
    const seat: PlayerSeat = seats[canonicalSeatIndex];
    const theme = COLOR_THEMES[seat.color];
    const isActiveTurn = currentTurnSeat === canonicalSeatIndex && phase !== 'GAME_OVER';
    const isEmpty = seat.type === 'empty';
    const isEliminated = Boolean(seat.eliminated);
    const isYou = visualCorner === 3 && !isEmpty && localHumanSeats.includes(canonicalSeatIndex);
    const strikes = seat.strikes ?? 0;

    const statusTag = isEliminated
      ? 'OUT'
      : strikes > 0
      ? `Bot ${Math.min(3, strikes)}/3`
      : seat.type === 'bot'
      ? 'CPU'
      : !seat.connected
      ? 'Reconn...'
      : `#${seat.id}`;

    const headerBar = (
      <div
        className="w-full h-full px-1.5 flex items-center justify-between gap-1 select-none"
        style={{ color: isEmpty || isEliminated ? '#57534E' : theme.textOnPrimary }}
      >
        {isEmpty ? (
          <span className="text-[10px] sm:text-xs font-semibold opacity-70 truncate">
            Empty Seat
          </span>
        ) : (
          <>
            <div className="flex items-center gap-1 min-w-0">
              {seat.type === 'bot' && <Bot className="w-3 h-3 shrink-0 opacity-90" />}
              {seat.type === 'human' && !isEliminated && !seat.connected && (
                <WifiOff className="w-3 h-3 shrink-0 opacity-90 animate-pulse" />
              )}
              <span
                className={`text-[10px] sm:text-xs font-extrabold truncate leading-none ${
                  isEliminated ? 'line-through opacity-75' : ''
                }`}
              >
                {seat.name}{isYou ? ' (You)' : ''}
              </span>
            </div>
            <span className="font-mono-id text-[9px] sm:text-[11px] font-bold opacity-90 shrink-0 leading-none">
              {statusTag}
            </span>
          </>
        )}
      </div>
    );

    return (
      <div
        key={`visual-yard-${visualCorner}`}
        className={`relative ${posClass} overflow-hidden transition-all duration-200 ${
          isActiveTurn ? 'ring-3 ring-inset ring-amber-200 z-10' : ''
        }`}
        style={{
          background:
            isEmpty || isEliminated
              ? 'linear-gradient(145deg, #E2E8F0 0%, #CBD5E1 100%)'
              : `linear-gradient(145deg, ${theme.ring} 0%, ${theme.primary} 52%, ${theme.dark} 100%)`,
          opacity: isEmpty ? 0.72 : isEliminated ? 0.52 : 1,
        }}
      >
        {!isEmpty && !isEliminated && (
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-[48%]"
            style={{
              background:
                'linear-gradient(180deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 100%)',
            }}
            aria-hidden="true"
          />
        )}

        {isActiveTurn && (
          <div
            className="absolute inset-0 pointer-events-none border-2 border-white/80 animate-pulse"
            aria-hidden="true"
          />
        )}

        {!headerAtBottom && (
          <div className="absolute top-0 left-0 right-0 h-[18%] flex items-center z-10">
            {headerBar}
          </div>
        )}

        {/* White Glossy Token Holder Box */}
        <div
          className="absolute left-[8%] right-[8%] rounded-xl bg-white shadow-[inset_0_2px_6px_rgba(15,23,42,0.14),0_3px_10px_rgba(0,0,0,0.22)] border-2 border-white/90 z-10"
          style={{
            top: headerAtBottom ? '8%' : '18%',
            bottom: headerAtBottom ? '18%' : '8%',
          }}
        >
          {[
            { left: '28%', top: '28%' },
            { left: '72%', top: '28%' },
            { left: '28%', top: '72%' },
            { left: '72%', top: '72%' },
          ].map((pos, wIdx) => (
            <div
              key={wIdx}
              className="absolute w-[26%] h-[26%] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 shadow-inner ring-1 ring-black/5"
              style={{
                left: pos.left,
                top: pos.top,
                backgroundColor: isEmpty || isEliminated ? '#F1F5F9' : theme.softBg,
                borderColor: isEmpty || isEliminated ? '#CBD5E1' : theme.primary,
              }}
            />
          ))}

          {isEliminated ? (
            <div className="absolute inset-0 bg-stone-900/75 rounded-xl flex flex-col items-center justify-center z-20">
              <WifiOff className="w-4 h-4 text-rose-300 mb-0.5" />
              <span className="text-[10px] sm:text-xs font-extrabold text-rose-200">
                Eliminated
              </span>
            </div>
          ) : (
            seat.finishedRank !== null && (
              <div className="absolute inset-0 bg-white/90 rounded-xl flex flex-col items-center justify-center z-20">
                <Crown className="w-5 h-5 text-amber-500 fill-amber-300 mb-0.5" />
                <span className="text-xs font-extrabold text-stone-900">
                  #{seat.finishedRank} Finished
                </span>
              </div>
            )
          )}
        </div>

        {headerAtBottom && (
          <div className="absolute bottom-0 left-0 right-0 h-[18%] flex items-center z-10">
            {headerBar}
          </div>
        )}
      </div>
    );
  };

  // Center triangle colors matched to the 4 rotated visual corners
  const leftColor = COLOR_THEMES[seats[getCanonicalSeatForVisualCorner(0)].color].primary;
  const topColor = COLOR_THEMES[seats[getCanonicalSeatForVisualCorner(1)].color].primary;
  const rightColor = COLOR_THEMES[seats[getCanonicalSeatForVisualCorner(2)].color].primary;
  const bottomColor = COLOR_THEMES[seats[getCanonicalSeatForVisualCorner(3)].color].primary;

  return (
    <div
      className="relative w-full aspect-square max-w-[min(97vw,520px,calc(100dvh-245px))] lg:max-w-[560px] mx-auto rounded-[22px] p-[7px] sm:p-[9px] select-none shadow-[0_18px_45px_rgba(0,0,0,0.65),0_0_28px_rgba(99,102,241,0.22)] ring-1 ring-amber-300/60"
      style={{
        background:
          'linear-gradient(145deg, #FBBF24 0%, #B45309 22%, #451A03 55%, #78350F 80%, #F59E0B 100%)',
      }}
    >
      {/* Inner Square Frame (exact 0..100% alignment box for grid + tokens) */}
      <div className="relative w-full h-full rounded-[14px] overflow-hidden border-2 border-amber-200/80 bg-slate-800 shadow-inner">
        {/* 15x15 Grid Layer */}
        <div
          className="w-full h-full grid bg-slate-300"
          style={{
            gridTemplateColumns: 'repeat(15, minmax(0, 1fr))',
            gridTemplateRows: 'repeat(15, minmax(0, 1fr))',
            gap: '1px',
          }}
        >
          {Array.from({ length: 15 }).map((_, row) =>
            Array.from({ length: 15 }).map((__, col) => {
              const inTopLeft = row < 6 && col < 6;
              const inTopRight = row < 6 && col >= 9;
              const inBottomLeft = row >= 9 && col < 6;
              const inBottomRight = row >= 9 && col >= 9;
              const inCenter = row >= 6 && row <= 8 && col >= 6 && col <= 8;

              if (inTopLeft || inTopRight || inBottomLeft || inBottomRight || inCenter) {
                return null;
              }

              const info = trackCellStyles.get(`${row}-${col}`);
              const bgColor = info?.bgColor || '#FFFFFF';
              const isColored = bgColor !== '#FFFFFF';
              const isYellow = info?.isYellowTile;

              return (
                <div
                  key={`cell-${row}-${col}`}
                  style={{
                    gridRowStart: row + 1,
                    gridColumnStart: col + 1,
                    backgroundColor: info?.isStar && !isColored ? '#FFFBEB' : bgColor,
                  }}
                  className="relative flex items-center justify-center overflow-hidden"
                >
                  {isColored && (
                    <span
                      className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent"
                      aria-hidden="true"
                    />
                  )}
                  {info?.isStar && (
                    <Star className="relative z-10 w-[62%] h-[62%] text-amber-500 fill-amber-300 stroke-[2] drop-shadow-[0_1px_1px_rgba(120,53,15,0.35)]" />
                  )}
                  {info?.visualStartCorner === 0 && (
                    <ArrowRight
                      className={`relative z-10 w-[62%] h-[62%] stroke-[2.75] drop-shadow-xs ${
                        isYellow ? 'text-amber-950' : 'text-white'
                      }`}
                    />
                  )}
                  {info?.visualStartCorner === 1 && (
                    <ArrowDown
                      className={`relative z-10 w-[62%] h-[62%] stroke-[2.75] drop-shadow-xs ${
                        isYellow ? 'text-amber-950' : 'text-white'
                      }`}
                    />
                  )}
                  {info?.visualStartCorner === 2 && (
                    <ArrowLeft
                      className={`relative z-10 w-[62%] h-[62%] stroke-[2.75] drop-shadow-xs ${
                        isYellow ? 'text-amber-950' : 'text-white'
                      }`}
                    />
                  )}
                  {info?.visualStartCorner === 3 && (
                    <ArrowUp
                      className={`relative z-10 w-[62%] h-[62%] stroke-[2.75] drop-shadow-xs ${
                        isYellow ? 'text-amber-950' : 'text-white'
                      }`}
                    />
                  )}
                  {isColored && info?.visualStartCorner === undefined && (
                    <span className="relative z-10 w-1.5 h-1.5 rounded-full bg-white/45" />
                  )}
                </div>
              );
            })
          )}

          {/* 4 Corner Home Yards: 0=Top-Left, 1=Top-Right, 2=Bottom-Right, 3=Bottom-Left (Local Player) */}
          {renderVisualYard(0, 'row-start-1 row-end-7 col-start-1 col-end-7', false)}
          {renderVisualYard(1, 'row-start-1 row-end-7 col-start-10 col-end-16', false)}
          {renderVisualYard(2, 'row-start-10 row-end-16 col-start-10 col-end-16', true)}
          {renderVisualYard(3, 'row-start-10 row-end-16 col-start-1 col-end-7', true)}

          {/* Center 3x3 Home Finish */}
          <div className="row-start-7 row-end-10 col-start-7 col-end-10 relative bg-white overflow-hidden">
            <svg viewBox="0 0 100 100" className="w-full h-full block">
              <polygon points="0,0 50,50 0,100" fill={leftColor} stroke="#1E293B" strokeWidth="1.2" />
              <polygon points="0,0 100,0 50,50" fill={topColor} stroke="#1E293B" strokeWidth="1.2" />
              <polygon points="100,0 100,100 50,50" fill={rightColor} stroke="#1E293B" strokeWidth="1.2" />
              <polygon points="0,100 100,100 50,50" fill={bottomColor} stroke="#1E293B" strokeWidth="1.2" />
              <circle cx="50" cy="50" r="16" fill="#FEF3C7" stroke="#D97706" strokeWidth="2" />
            </svg>
            <Crown className="w-4 h-4 text-amber-600 fill-amber-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        {/* Shared SVG gradients for 3D teardrop map-pin tokens */}
        <svg width="0" height="0" className="absolute pointer-events-none" aria-hidden="true">
          <defs>
            {(['red', 'green', 'yellow', 'blue'] as const).map((colorKey) => {
              const t = COLOR_THEMES[colorKey];
              return (
                <linearGradient
                  key={colorKey}
                  id={`pin-body-${colorKey}`}
                  x1="20%"
                  y1="5%"
                  x2="85%"
                  y2="95%"
                >
                  <stop offset="0%" stopColor={t.ring} />
                  <stop offset="45%" stopColor={t.primary} />
                  <stop offset="100%" stopColor={t.dark} />
                </linearGradient>
              );
            })}
            <linearGradient id="pin-gloss-top" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.65" />
              <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>

        {/* Interactive Tokens Overlay */}
        <div className="absolute inset-0 pointer-events-none">
          {positionedTokens.map(({ token, x, y, stackIndex, stackSize }) => {
            const seat = seats[token.seatIndex];
            const theme = COLOR_THEMES[seat.color];
            const isLegal =
              isLocalTurn &&
              token.seatIndex === currentTurnSeat &&
              legalTokenIndices.includes(token.tokenIndex);

            let offsetX = 0;
            let offsetY = 0;
            let scale = 1;
            if (stackSize > 1) {
              const angle = (stackIndex / stackSize) * Math.PI * 2;
              const radius = stackSize === 2 ? 1.1 : 1.35;
              offsetX = Math.cos(angle) * radius;
              offsetY = Math.sin(angle) * radius;
              scale = stackSize >= 3 ? 0.78 : 0.86;
            }

            if (token.step === 56) {
              scale *= 0.8;
            }

            return (
              <button
                key={`token-${token.seatIndex}-${token.tokenIndex}`}
                type="button"
                disabled={!isLegal}
                onClick={() => isLegal && onTokenClick(token.tokenIndex)}
                aria-label={`${theme.name} token ${token.tokenIndex + 1}`}
                style={{
                  left: `${x + offsetX}%`,
                  top: `${y + offsetY}%`,
                  width: '6.8%',
                  height: '8.2%',
                  transform: `translate(-50%, -62%) scale(${scale})`,
                  zIndex: isLegal ? 35 : 20 + token.seatIndex,
                }}
                className={`absolute flex items-center justify-center transition-all duration-200 ease-out ${
                  isLegal ? 'pointer-events-auto cursor-pointer' : 'pointer-events-none'
                }`}
              >
                {isLegal && (
                  <span
                    className="absolute inset-x-0 top-[6%] bottom-[16%] rounded-full border-2 border-stone-900 bg-white/35 animate-legal-ring"
                    aria-hidden="true"
                  />
                )}

                <svg
                  viewBox="0 0 40 48"
                  className={`relative w-full h-full overflow-visible ${
                    isLegal ? 'animate-token-hop' : ''
                  }`}
                  style={{
                    filter: isLegal
                      ? 'drop-shadow(0 0 3px rgba(28,25,23,0.85)) drop-shadow(0 4px 5px rgba(0,0,0,0.35))'
                      : 'drop-shadow(0 2px 2.5px rgba(0,0,0,0.28))',
                  }}
                >
                  {/* Ground Drop Shadow beneath pin tip */}
                  <ellipse
                    cx="20"
                    cy="44"
                    rx="8.5"
                    ry="2.8"
                    fill="rgba(0,0,0,0.3)"
                  />

                  {/* Sleek 3D Teardrop / Map-Pin Silhouette */}
                  <path
                    d="M 20 43.2 C 23.5 35.8 34 24.8 34 16.5 A 14 14 0 1 0 6 16.5 C 6 24.8 16.5 35.8 20 43.2 Z"
                    fill={`url(#pin-body-${seat.color})`}
                    stroke={theme.dark}
                    strokeWidth="1.35"
                    strokeLinejoin="round"
                  />

                  {/* Top Curved Gloss Highlight on Pin Body */}
                  <path
                    d="M 9.2 15.5 A 10.8 10.8 0 0 1 30.8 15.5 A 11.2 9.5 0 0 0 9.2 15.5 Z"
                    fill="url(#pin-gloss-top)"
                  />

                  {/* Subtle Inner Rim Shadow */}
                  <circle cx="20" cy="17.1" r="9.8" fill="rgba(0,0,0,0.18)" />

                  {/* Glossy White Outer Ring on Top Head */}
                  <circle
                    cx="20"
                    cy="16.3"
                    r="9.5"
                    fill="#FFFFFF"
                    stroke="rgba(255,255,255,0.9)"
                    strokeWidth="0.6"
                  />

                  {/* Vibrant Colored Center Dot */}
                  <circle
                    cx="20"
                    cy="16.3"
                    r="5.6"
                    fill={`url(#pin-body-${seat.color})`}
                    stroke={theme.dark}
                    strokeWidth="0.65"
                  />

                  {/* Tiny Glossy Specular Dot */}
                  <circle
                    cx="18.2"
                    cy="14.5"
                    r="1.6"
                    fill="rgba(255,255,255,0.68)"
                  />
                </svg>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
