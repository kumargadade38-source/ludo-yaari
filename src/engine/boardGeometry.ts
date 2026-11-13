import { PlayerColor } from '../types/ludo';

export interface GridCoord {
  row: number; // 0..14
  col: number; // 0..14
}

export interface PercentPoint {
  x: number; // 0..100
  y: number; // 0..100
}

export const PLAYER_COLORS: PlayerColor[] = ['red', 'green', 'yellow', 'blue'];

export const COLOR_THEMES: Record<
  PlayerColor,
  {
    name: string;
    primary: string;
    dark: string;
    light: string;
    softBg: string;
    textOnPrimary: string;
    ring: string;
  }
> = {
  red: {
    name: 'Red',
    primary: '#E11D48',
    dark: '#9F1239',
    light: '#FFE4E6',
    softBg: '#FFF1F2',
    textOnPrimary: '#FFFFFF',
    ring: '#FB7185',
  },
  green: {
    name: 'Green',
    primary: '#16A34A',
    dark: '#14532D',
    light: '#DCFCE7',
    softBg: '#F0FDF4',
    textOnPrimary: '#FFFFFF',
    ring: '#4ADE80',
  },
  yellow: {
    name: 'Yellow',
    primary: '#EAB308',
    dark: '#713F12',
    light: '#FEF9C3',
    softBg: '#FEFCE8',
    textOnPrimary: '#422006',
    ring: '#FACC15',
  },
  blue: {
    name: 'Blue',
    primary: '#2563EB',
    dark: '#1E3A8A',
    light: '#DBEAFE',
    softBg: '#EFF6FF',
    textOnPrimary: '#FFFFFF',
    ring: '#60A5FA',
  },
};

/**
 * 52-cell clockwise main track starting from Red's start square (row 6, col 1).
 */
export const MAIN_TRACK_COORDS: GridCoord[] = [
  // Red arm -> up into Top arm (0..12)
  { row: 6, col: 1 }, // 0: Red Start (SAFE)
  { row: 6, col: 2 }, // 1
  { row: 6, col: 3 }, // 2
  { row: 6, col: 4 }, // 3
  { row: 6, col: 5 }, // 4
  { row: 5, col: 6 }, // 5
  { row: 4, col: 6 }, // 6
  { row: 3, col: 6 }, // 7
  { row: 2, col: 6 }, // 8: Star (SAFE)
  { row: 1, col: 6 }, // 9
  { row: 0, col: 6 }, // 10
  { row: 0, col: 7 }, // 11
  { row: 0, col: 8 }, // 12

  // Top arm down -> Right arm (13..25)
  { row: 1, col: 8 }, // 13: Green Start (SAFE)
  { row: 2, col: 8 }, // 14
  { row: 3, col: 8 }, // 15
  { row: 4, col: 8 }, // 16
  { row: 5, col: 8 }, // 17
  { row: 6, col: 9 }, // 18
  { row: 6, col: 10 }, // 19
  { row: 6, col: 11 }, // 20
  { row: 6, col: 12 }, // 21: Star (SAFE)
  { row: 6, col: 13 }, // 22
  { row: 6, col: 14 }, // 23
  { row: 7, col: 14 }, // 24
  { row: 8, col: 14 }, // 25

  // Right arm left -> Bottom arm (26..38)
  { row: 8, col: 13 }, // 26: Yellow Start (SAFE)
  { row: 8, col: 12 }, // 27
  { row: 8, col: 11 }, // 28
  { row: 8, col: 10 }, // 29
  { row: 8, col: 9 }, // 30
  { row: 9, col: 8 }, // 31
  { row: 10, col: 8 }, // 32
  { row: 11, col: 8 }, // 33
  { row: 12, col: 8 }, // 34: Star (SAFE)
  { row: 13, col: 8 }, // 35
  { row: 14, col: 8 }, // 36
  { row: 14, col: 7 }, // 37
  { row: 14, col: 6 }, // 38

  // Bottom arm up -> Left arm (39..51)
  { row: 13, col: 6 }, // 39: Blue Start (SAFE)
  { row: 12, col: 6 }, // 40
  { row: 11, col: 6 }, // 41
  { row: 10, col: 6 }, // 42
  { row: 9, col: 6 }, // 43
  { row: 8, col: 5 }, // 44
  { row: 8, col: 4 }, // 45
  { row: 8, col: 3 }, // 46
  { row: 8, col: 2 }, // 47: Star (SAFE)
  { row: 8, col: 1 }, // 48
  { row: 8, col: 0 }, // 49
  { row: 7, col: 0 }, // 50
  { row: 6, col: 0 }, // 51
];

export const START_TRACK_INDEX: Record<number, number> = {
  0: 0, // Red
  1: 13, // Green
  2: 26, // Yellow
  3: 39, // Blue
};

export const SAFE_TRACK_INDICES = new Set<number>([0, 8, 13, 21, 26, 34, 39, 47]);
export const STAR_TRACK_INDICES = new Set<number>([8, 21, 34, 47]);

/**
 * Colored home columns (steps 51..55) + center triangle finish (step 56)
 */
export const HOME_COLUMN_COORDS: Record<number, GridCoord[]> = {
  // Red: left -> center
  0: [
    { row: 7, col: 1 },
    { row: 7, col: 2 },
    { row: 7, col: 3 },
    { row: 7, col: 4 },
    { row: 7, col: 5 },
    { row: 7, col: 6 }, // 56: finish
  ],
  // Green: top -> center
  1: [
    { row: 1, col: 7 },
    { row: 2, col: 7 },
    { row: 3, col: 7 },
    { row: 4, col: 7 },
    { row: 5, col: 7 },
    { row: 6, col: 7 }, // 56: finish
  ],
  // Yellow: right -> center
  2: [
    { row: 7, col: 13 },
    { row: 7, col: 12 },
    { row: 7, col: 11 },
    { row: 7, col: 10 },
    { row: 7, col: 9 },
    { row: 7, col: 8 }, // 56: finish
  ],
  // Blue: bottom -> center
  3: [
    { row: 13, col: 7 },
    { row: 12, col: 7 },
    { row: 11, col: 7 },
    { row: 10, col: 7 },
    { row: 9, col: 7 },
    { row: 8, col: 7 }, // 56: finish
  ],
};

/**
 * Exact center percentages (0..100) for the 4 home yard token slots of each seat,
 * aligned cleanly with the inner white 2x2 well box inside each 6x6 corner yard.
 */
export const YARD_SLOT_PERCENT: Record<number, PercentPoint[]> = {
  // Red (Top-Left: 0..40% X, 0..40% Y, header at top 18%, white box X:8..92%, Y:18..92%)
  0: [
    { x: 12.6, y: 15.5 },
    { x: 27.4, y: 15.5 },
    { x: 12.6, y: 28.5 },
    { x: 27.4, y: 28.5 },
  ],
  // Green (Top-Right: 60..100% X, 0..40% Y)
  1: [
    { x: 72.6, y: 15.5 },
    { x: 87.4, y: 15.5 },
    { x: 72.6, y: 28.5 },
    { x: 87.4, y: 28.5 },
  ],
  // Yellow (Bottom-Right: 60..100% X, 60..100% Y, header at bottom 18%, white box X:8..92%, Y:8..82%)
  2: [
    { x: 72.6, y: 71.5 },
    { x: 87.4, y: 71.5 },
    { x: 72.6, y: 84.5 },
    { x: 87.4, y: 84.5 },
  ],
  // Blue (Bottom-Left: 0..40% X, 60..100% Y)
  3: [
    { x: 12.6, y: 71.5 },
    { x: 27.4, y: 71.5 },
    { x: 12.6, y: 84.5 },
    { x: 27.4, y: 84.5 },
  ],
};

/**
 * Number of 90-degree clockwise steps needed to rotate the board so that
 * `viewerSeat` appears at Bottom-Left (canonical position 3).
 */
export function getRotationSteps(viewerSeat: number): number {
  return (3 - viewerSeat + 4) % 4;
}

export function rotateGridCoord(coord: GridCoord, rotationSteps: number): GridCoord {
  const step = ((rotationSteps % 4) + 4) % 4;
  if (step === 1) return { row: coord.col, col: 14 - coord.row };
  if (step === 2) return { row: 14 - coord.row, col: 14 - coord.col };
  if (step === 3) return { row: 14 - coord.col, col: coord.row };
  return coord;
}

export function rotatePercentPoint(pt: PercentPoint, rotationSteps: number): PercentPoint {
  const step = ((rotationSteps % 4) + 4) % 4;
  if (step === 1) return { x: 100 - pt.y, y: pt.x };
  if (step === 2) return { x: 100 - pt.x, y: 100 - pt.y };
  if (step === 3) return { x: pt.y, y: 100 - pt.x };
  return pt;
}

export function getTokenBoardPercent(
  seatIndex: number,
  tokenIndex: number,
  step: number,
  viewerSeat = 2
): PercentPoint {
  const rotationSteps = getRotationSteps(viewerSeat);
  const visualCorner = (seatIndex + rotationSteps) % 4;

  if (step < 0) {
    return YARD_SLOT_PERCENT[visualCorner][tokenIndex];
  }

  let coord: GridCoord;
  if (step <= 50) {
    const globalIdx = (START_TRACK_INDEX[seatIndex] + step) % 52;
    coord = MAIN_TRACK_COORDS[globalIdx];
  } else {
    const colIdx = Math.min(5, step - 51);
    coord = HOME_COLUMN_COORDS[seatIndex][colIdx];
  }

  // Finished tokens nest neatly inside their visual corner's center triangle
  if (step === 56) {
    if (visualCorner === 0) return { x: 43.2, y: 50 };
    if (visualCorner === 1) return { x: 50, y: 43.2 };
    if (visualCorner === 2) return { x: 56.8, y: 50 };
    if (visualCorner === 3) return { x: 50, y: 56.8 };
  }

  const rotatedCoord = rotateGridCoord(coord, rotationSteps);
  const cellSize = 100 / 15;
  return {
    x: (rotatedCoord.col + 0.5) * cellSize,
    y: (rotatedCoord.row + 0.5) * cellSize,
  };
}

export function getGlobalTrackIndex(seatIndex: number, step: number): number | null {
  if (step < 0 || step > 50) return null;
  return (START_TRACK_INDEX[seatIndex] + step) % 52;
}
