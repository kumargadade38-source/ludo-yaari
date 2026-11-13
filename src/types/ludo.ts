export type PlayerColor = 'red' | 'green' | 'yellow' | 'blue';

export interface PlayerProfile {
  id: string; // Permanent 6-digit numeric ID
  name: string;
  createdAt: number;
}

export interface FriendEntry {
  id: string; // 6-digit numeric ID
  nickname: string;
  addedAt: number;
}

export type SeatType = 'human' | 'bot' | 'empty';

export interface PlayerSeat {
  seatIndex: number; // 0: red, 1: green, 2: yellow, 3: blue
  color: PlayerColor;
  type: SeatType;
  id: string; // 6-digit ID for humans, or 'BOT-1' etc.
  name: string;
  connected: boolean;
  finishedRank: number | null; // 1 = 1st place, 2 = 2nd, etc.
  strikes?: number; // 0, 1, 2 (3rd strike eliminates player)
  eliminated?: boolean; // true once eliminated after 3rd strike
  autoBotActive?: boolean; // true while temporarily auto-played by Computer AI
}

/**
 * Token step encoding:
 * -1 = Inside home yard (needs 6 to enter start square)
 * 0..50 = On main 52-cell outer track (0 is player's start square)
 * 51..55 = On player's colored home column (5 cells)
 * 56 = Finished in center home triangle
 */
export interface TokenState {
  seatIndex: number;
  tokenIndex: number; // 0..3
  step: number; // -1 to 56
}

export type TurnPhase = 'WAIT_ROLL' | 'ROLLING' | 'WAIT_MOVE' | 'GAME_OVER';

export type GameMode = 'bot' | 'online';

export interface GameEventLog {
  id: string;
  text: string;
  color: PlayerColor;
  timestamp: number;
}

export interface GameState {
  mode: GameMode;
  seats: PlayerSeat[];
  tokens: TokenState[]; // 4 tokens per active seat (stored for all 4 seats = 16 tokens for stable indexing)
  currentTurnSeat: number; // 0..3
  phase: TurnPhase;
  diceValue: number | null;
  consecutiveSixes: number;
  legalTokenIndices: number[]; // tokenIndex values (0..3) valid for currentTurnSeat
  lastEvent: string;
  winnerOrder: number[]; // seatIndices in order of finishing
  turnSequence: number; // monotonically increments on every mutation for idempotency
  turnRemainingMs?: number; // remaining ms in current 30s turn window (online mode)
  autoBotPlayingSeat?: number | null; // seatIndex currently finishing an auto-bot turn
  hostId?: string; // authoritative host 6-digit ID in online mode
}

export type LobbyStatus = 'idle' | 'hosting' | 'joining' | 'connected' | 'error';

export interface ActiveOnlineSession {
  hostId: string;
  seatIndex: number;
  playerId: string;
  hostName: string;
  candidateHostIds: string[];
  startedAt: number;
}

export type PeerMessage =
  | { type: 'HELLO'; profile: PlayerProfile }
  | { type: 'REJOIN_REQUEST'; profile: PlayerProfile }
  | { type: 'PLAYER_REJOINED'; profile: PlayerProfile }
  | { type: 'PLAYER_AWAY'; playerId: string }
  | { type: 'REJOIN_REJECTED'; reason: string }
  | { type: 'LOBBY_SYNC'; seats: PlayerSeat[]; hostId: string; statusMessage?: string }
  | { type: 'GAME_START'; state: GameState }
  | { type: 'STATE_SYNC'; state: GameState; soundCue?: SoundCue; soundSteps?: number }
  | { type: 'HOST_TRANSFER'; newHostId: string; state: GameState }
  | { type: 'ACTION_ROLL'; playerId: string }
  | { type: 'ACTION_MOVE'; playerId: string; tokenIndex: number }
  | { type: 'ROOM_FULL' }
  | { type: 'INVITE'; hostProfile: PlayerProfile }
  | { type: 'PING' }
  | { type: 'PONG' }
  | { type: 'MATCH_ENDED_BACK_TO_LOBBY' };

export type SoundCue =
  | 'dice'
  | 'six'
  | 'move'
  | 'open'
  | 'capture'
  | 'safe'
  | 'home'
  | 'turn'
  | 'win'
  | 'none';

