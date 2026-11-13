import { GameMode, GameState, PlayerSeat, SoundCue, TokenState } from '../types/ludo';
import {
  COLOR_THEMES,
  PLAYER_COLORS,
  SAFE_TRACK_INDICES,
  getGlobalTrackIndex,
} from './boardGeometry';

export const TURN_DURATION_MS = 30000;

/**
 * Creates a fresh GameState from a list of 4 configured seats (some may be 'empty').
 */
export function createInitialGameState(
  mode: GameMode,
  seats: PlayerSeat[],
  hostId?: string
): GameState {
  const tokens: TokenState[] = [];
  for (let s = 0; s < 4; s++) {
    for (let t = 0; t < 4; t++) {
      tokens.push({ seatIndex: s, tokenIndex: t, step: -1 });
    }
  }

  const normalizedSeats = seats.map((seat, idx) => ({
    ...seat,
    seatIndex: idx,
    color: PLAYER_COLORS[idx],
    finishedRank: null,
    strikes: 0,
    eliminated: false,
    autoBotActive: false,
  }));

  const firstActive = normalizedSeats.find((s) => s.type !== 'empty')?.seatIndex ?? 0;

  return {
    mode,
    seats: normalizedSeats,
    tokens,
    currentTurnSeat: firstActive,
    phase: 'WAIT_ROLL',
    diceValue: null,
    consecutiveSixes: 0,
    legalTokenIndices: [],
    lastEvent: `${normalizedSeats[firstActive].name}'s turn to roll`,
    winnerOrder: [],
    turnSequence: 1,
    turnRemainingMs: TURN_DURATION_MS,
    autoBotPlayingSeat: null,
    hostId,
  };
}

/**
 * Helper to create seats for offline Play vs Computer mode (1 human + 1..3 bots).
 */
export function createBotMatchSeats(
  playerName: string,
  playerId: string,
  botCount: 1 | 2 | 3
): PlayerSeat[] {
  // Use [0, 2] for 1v1 (diagonal Top-Right vs Bottom-Left), [0, 1, 2] for 3P (Computers at Top-Left & Top-Right), [0, 1, 2, 3] for 4P
  const activeSeatOrder = botCount === 1 ? [0, 2] : botCount === 2 ? [0, 1, 2] : [0, 1, 2, 3];
  const botNames = ['Computer 1', 'Computer 2', 'Computer 3'];

  let botIdx = 0;
  return PLAYER_COLORS.map((color, seatIndex) => {
    if (seatIndex === 0) {
      return {
        seatIndex,
        color,
        type: 'human',
        id: playerId,
        name: playerName,
        connected: true,
        finishedRank: null,
        strikes: 0,
        eliminated: false,
        autoBotActive: false,
      };
    }
    if (activeSeatOrder.includes(seatIndex)) {
      const bName = botNames[botIdx++] || `Computer ${botIdx}`;
      return {
        seatIndex,
        color,
        type: 'bot',
        id: `BOT-${seatIndex}`,
        name: bName,
        connected: true,
        finishedRank: null,
        strikes: 0,
        eliminated: false,
        autoBotActive: false,
      };
    }
    return {
      seatIndex,
      color,
      type: 'empty',
      id: '',
      name: '',
      connected: false,
      finishedRank: null,
      strikes: 0,
      eliminated: false,
      autoBotActive: false,
    };
  });
}

export function getNextActiveSeat(seats: PlayerSeat[], currentSeat: number): number {
  for (let offset = 1; offset <= 4; offset++) {
    const candidate = (currentSeat + offset) % 4;
    const seat = seats[candidate];
    if (seat && seat.type !== 'empty' && !seat.eliminated && seat.finishedRank === null) {
      return candidate;
    }
  }
  return currentSeat;
}

export function getLegalMoves(
  tokens: TokenState[],
  seatIndex: number,
  diceValue: number
): number[] {
  const playerTokens = tokens.filter((t) => t.seatIndex === seatIndex);
  const legal: number[] = [];

  for (const t of playerTokens) {
    if (t.step === -1) {
      if (diceValue === 6) legal.push(t.tokenIndex);
    } else if (t.step < 56) {
      if (t.step + diceValue <= 56) {
        legal.push(t.tokenIndex);
      }
    }
  }
  return legal;
}

export function rollDieValue(): number {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const buf = new Uint8Array(1);
    // Reject values >= 252 (since 252 is divisible by 6) to guarantee zero modulo bias
    while (true) {
      crypto.getRandomValues(buf);
      if (buf[0] < 252) {
        return (buf[0] % 6) + 1;
      }
    }
  }
  return Math.floor(Math.random() * 6) + 1;
}

export interface TransitionResult {
  state: GameState;
  sound: SoundCue;
  turnPassedImmediately: boolean;
  newHostId?: string;
}

/**
 * Applies a dice roll to the authoritative GameState.
 */
export function applyDiceRoll(
  state: GameState,
  forcedRoll?: number,
  remainingMsForMove?: number
): TransitionResult {
  if (state.phase === 'GAME_OVER') {
    return { state, sound: 'none', turnPassedImmediately: false };
  }

  const roll = forcedRoll ?? rollDieValue();
  const currentSeat = state.seats[state.currentTurnSeat];
  const newSixes = roll === 6 ? state.consecutiveSixes + 1 : 0;

  // Classic triple-6 penalty: forfeit turn
  if (newSixes >= 3) {
    if (
      state.mode === 'online' &&
      (currentSeat.strikes ?? 0) >= 3 &&
      currentSeat.autoBotActive
    ) {
      const elim = eliminateSeatFromGame(
        { ...state, diceValue: roll, consecutiveSixes: 0, legalTokenIndices: [] },
        state.currentTurnSeat
      );
      return {
        state: elim.state,
        sound: elim.sound,
        turnPassedImmediately: true,
        newHostId: elim.newHostId,
      };
    }

    const nextSeat = getNextActiveSeat(state.seats, state.currentTurnSeat);
    const nextPlayer = state.seats[nextSeat];
    return {
      state: {
        ...state,
        diceValue: roll,
        consecutiveSixes: 0,
        legalTokenIndices: [],
        currentTurnSeat: nextSeat,
        phase: 'WAIT_ROLL',
        autoBotPlayingSeat: null,
        turnRemainingMs: TURN_DURATION_MS,
        lastEvent: `${currentSeat.name} rolled three 6s! Turn passed to ${nextPlayer.name}`,
        turnSequence: state.turnSequence + 1,
      },
      sound: roll === 6 ? 'six' : 'dice',
      turnPassedImmediately: true,
    };
  }

  const legal = getLegalMoves(state.tokens, state.currentTurnSeat, roll);

  if (legal.length === 0) {
    if (
      state.mode === 'online' &&
      (currentSeat.strikes ?? 0) >= 3 &&
      currentSeat.autoBotActive
    ) {
      const elim = eliminateSeatFromGame(
        { ...state, diceValue: roll, consecutiveSixes: 0, legalTokenIndices: [] },
        state.currentTurnSeat
      );
      return {
        state: elim.state,
        sound: elim.sound,
        turnPassedImmediately: true,
        newHostId: elim.newHostId,
      };
    }

    const nextSeat = getNextActiveSeat(state.seats, state.currentTurnSeat);
    const nextPlayer = state.seats[nextSeat];
    return {
      state: {
        ...state,
        diceValue: roll,
        consecutiveSixes: 0,
        legalTokenIndices: [],
        currentTurnSeat: nextSeat,
        phase: 'WAIT_ROLL',
        autoBotPlayingSeat: null,
        turnRemainingMs: TURN_DURATION_MS,
        lastEvent: `${currentSeat.name} rolled ${roll} · No legal moves · ${nextPlayer.name}'s turn`,
        turnSequence: state.turnSequence + 1,
      },
      sound: roll === 6 ? 'six' : 'dice',
      turnPassedImmediately: true,
    };
  }

  return {
    state: {
      ...state,
      diceValue: roll,
      consecutiveSixes: newSixes,
      legalTokenIndices: legal,
      phase: 'WAIT_MOVE',
      turnRemainingMs: remainingMsForMove ?? state.turnRemainingMs ?? TURN_DURATION_MS,
      lastEvent: `${currentSeat.name} rolled ${roll}! Select a highlighted token`,
      turnSequence: state.turnSequence + 1,
    },
    sound: roll === 6 ? 'six' : 'dice',
    turnPassedImmediately: false,
  };
}

/**
 * Applies a token move for the current turn player.
 */
export function applyTokenMove(state: GameState, tokenIndex: number): TransitionResult {
  if (state.phase !== 'WAIT_MOVE' || state.diceValue === null) {
    return { state, sound: 'none', turnPassedImmediately: false };
  }
  if (!state.legalTokenIndices.includes(tokenIndex)) {
    return { state, sound: 'none', turnPassedImmediately: false };
  }

  const seatIdx = state.currentTurnSeat;
  const currentSeat = state.seats[seatIdx];
  const dice = state.diceValue;

  const updatedTokens = state.tokens.map((t) => ({ ...t }));
  const movingToken = updatedTokens.find(
    (t) => t.seatIndex === seatIdx && t.tokenIndex === tokenIndex
  );
  if (!movingToken) {
    return { state, sound: 'none', turnPassedImmediately: false };
  }

  let sound: SoundCue = 'move';
  let eventMsg = '';
  let earnedBonusRoll = dice === 6;

  if (movingToken.step === -1) {
    // Open token onto start square
    movingToken.step = 0;
    sound = 'open';
    eventMsg = `${currentSeat.name} opened a ${COLOR_THEMES[currentSeat.color].name} token`;
  } else {
    movingToken.step += dice;

    if (movingToken.step === 56) {
      sound = 'home';
      earnedBonusRoll = true;
      eventMsg = `${currentSeat.name} reached Home! Bonus roll`;
    } else {
      const targetGlobal = getGlobalTrackIndex(seatIdx, movingToken.step);
      if (targetGlobal !== null && !SAFE_TRACK_INDICES.has(targetGlobal)) {
        // Check opponent tokens at this exact global track cell
        const captured = updatedTokens.filter((other) => {
          if (other.seatIndex === seatIdx) return false;
          if (state.seats[other.seatIndex]?.eliminated) return false;
          const otherGlobal = getGlobalTrackIndex(other.seatIndex, other.step);
          return otherGlobal === targetGlobal;
        });

        if (captured.length > 0) {
          for (const victim of captured) {
            victim.step = -1;
          }
          sound = 'capture';
          earnedBonusRoll = true;
          const victimName = state.seats[captured[0].seatIndex]?.name || 'opponent';
          eventMsg = `${currentSeat.name} captured ${victimName}'s token! Bonus roll`;
        } else {
          eventMsg = `${currentSeat.name} moved ${dice} ${dice === 1 ? 'step' : 'steps'}`;
        }
      } else if (targetGlobal !== null && SAFE_TRACK_INDICES.has(targetGlobal)) {
        sound = 'safe';
        eventMsg = `${currentSeat.name} landed on a safe square`;
      } else {
        eventMsg = `${currentSeat.name} advanced inside home lane`;
      }
    }
  }

  // Check if current player has finished all 4 tokens
  const finishedCount = updatedTokens.filter(
    (t) => t.seatIndex === seatIdx && t.step === 56
  ).length;

  const updatedSeats = state.seats.map((s) => ({ ...s }));
  const updatedWinners = [...state.winnerOrder];

  if (finishedCount === 4 && updatedSeats[seatIdx].finishedRank === null) {
    updatedWinners.push(seatIdx);
    updatedSeats[seatIdx].finishedRank = updatedWinners.length;
    earnedBonusRoll = false; // Player finished; pass turn or end game
  }

  const activeRemaining = updatedSeats.filter(
    (s) => s.type !== 'empty' && !s.eliminated && s.finishedRank === null
  );

  // Match ends as soon as only 1 player remains unfinished (or everyone finished)
  if (activeRemaining.length <= 1) {
    if (activeRemaining.length === 1) {
      const lastSeat = activeRemaining[0];
      updatedWinners.push(lastSeat.seatIndex);
      updatedSeats[lastSeat.seatIndex].finishedRank = updatedWinners.length;
    }
    const champion = updatedSeats[updatedWinners[0]];
    return {
      state: {
        ...state,
        seats: updatedSeats,
        tokens: updatedTokens,
        phase: 'GAME_OVER',
        diceValue: null,
        consecutiveSixes: 0,
        legalTokenIndices: [],
        winnerOrder: updatedWinners,
        autoBotPlayingSeat: null,
        turnRemainingMs: 0,
        lastEvent: `${champion.name} won the match!`,
        turnSequence: state.turnSequence + 1,
      },
      sound: 'win',
      turnPassedImmediately: false,
    };
  }

  if (earnedBonusRoll) {
    return {
      state: {
        ...state,
        seats: updatedSeats,
        tokens: updatedTokens,
        phase: 'WAIT_ROLL',
        diceValue: null,
        legalTokenIndices: [],
        winnerOrder: updatedWinners,
        turnRemainingMs: TURN_DURATION_MS,
        lastEvent: `${eventMsg} · Roll again!`,
        turnSequence: state.turnSequence + 1,
      },
      sound,
      turnPassedImmediately: false,
    };
  }

  // After the 3rd Auto-Bot turn completes, eliminate if the player still hasn't returned
  if (
    state.mode === 'online' &&
    (updatedSeats[seatIdx]?.strikes ?? 0) >= 3 &&
    updatedSeats[seatIdx]?.autoBotActive
  ) {
    const elim = eliminateSeatFromGame(
      {
        ...state,
        seats: updatedSeats,
        tokens: updatedTokens,
        winnerOrder: updatedWinners,
      },
      seatIdx
    );
    return {
      state: elim.state,
      sound: elim.sound,
      turnPassedImmediately: false,
      newHostId: elim.newHostId,
    };
  }

  const nextSeat = getNextActiveSeat(updatedSeats, seatIdx);
  const nextPlayer = updatedSeats[nextSeat];

  return {
    state: {
      ...state,
      seats: updatedSeats,
      tokens: updatedTokens,
      currentTurnSeat: nextSeat,
      phase: 'WAIT_ROLL',
      diceValue: null,
      consecutiveSixes: 0,
      legalTokenIndices: [],
      winnerOrder: updatedWinners,
      autoBotPlayingSeat: null,
      turnRemainingMs: TURN_DURATION_MS,
      lastEvent: `${eventMsg} · ${nextPlayer.name}'s turn`,
      turnSequence: state.turnSequence + 1,
    },
    sound,
    turnPassedImmediately: false,
  };
}

/**
 * Eliminates a player after their 3rd missed/disconnected strike (~90s total),
 * removes their tokens, and either declares the remaining player winner (2P)
 * or continues smoothly with the remaining active players (3P/4P).
 */
export function eliminateSeatFromGame(
  state: GameState,
  targetSeatIndex: number
): { state: GameState; sound: SoundCue; newHostId?: string } {
  const updatedSeats = state.seats.map((s) =>
    s.seatIndex === targetSeatIndex
      ? {
          ...s,
          eliminated: true,
          connected: false,
          autoBotActive: false,
          strikes: 3,
        }
      : { ...s }
  );

  // Remove eliminated player's tokens back off the active track
  const updatedTokens = state.tokens.map((t) =>
    t.seatIndex === targetSeatIndex ? { ...t, step: -1 } : { ...t }
  );

  const eliminatedSeat = state.seats[targetSeatIndex];
  const remainingActive = updatedSeats.filter(
    (s) => s.type !== 'empty' && !s.eliminated && s.finishedRank === null
  );

  const updatedWinners = [...state.winnerOrder];

  // If 2P match or only 1 unfinished active player left -> declare remaining player Winner
  if (remainingActive.length <= 1) {
    if (remainingActive.length === 1) {
      const winnerSeat = remainingActive[0];
      updatedWinners.push(winnerSeat.seatIndex);
      updatedSeats[winnerSeat.seatIndex].finishedRank = updatedWinners.length;
    }
    const champion = updatedSeats[updatedWinners[0]];
    return {
      state: {
        ...state,
        seats: updatedSeats,
        tokens: updatedTokens,
        phase: 'GAME_OVER',
        diceValue: null,
        consecutiveSixes: 0,
        legalTokenIndices: [],
        winnerOrder: updatedWinners,
        autoBotPlayingSeat: null,
        turnRemainingMs: 0,
        lastEvent: `${eliminatedSeat?.name || 'Player'} eliminated · ${
          champion?.name || 'Winner'
        } wins!`,
        turnSequence: state.turnSequence + 1,
      },
      sound: 'win',
    };
  }

  // Transfer Host control automatically if the eliminated player was the Host
  let nextHostId = state.hostId;
  let newHostTransferredTo: string | undefined;
  if (state.hostId && eliminatedSeat?.id === state.hostId) {
    const candidateHost =
      remainingActive.find((s) => s.type === 'human' && s.connected) ||
      remainingActive.find((s) => s.type === 'human');
    if (candidateHost) {
      nextHostId = candidateHost.id;
      newHostTransferredTo = candidateHost.id;
    }
  }

  const nextSeat =
    state.currentTurnSeat === targetSeatIndex
      ? getNextActiveSeat(updatedSeats, targetSeatIndex)
      : state.currentTurnSeat;
  const nextPlayer = updatedSeats[nextSeat];

  return {
    state: {
      ...state,
      seats: updatedSeats,
      tokens: updatedTokens,
      currentTurnSeat: nextSeat,
      phase: state.currentTurnSeat === targetSeatIndex ? 'WAIT_ROLL' : state.phase,
      diceValue: state.currentTurnSeat === targetSeatIndex ? null : state.diceValue,
      consecutiveSixes: state.currentTurnSeat === targetSeatIndex ? 0 : state.consecutiveSixes,
      legalTokenIndices: state.currentTurnSeat === targetSeatIndex ? [] : state.legalTokenIndices,
      autoBotPlayingSeat: null,
      turnRemainingMs:
        state.currentTurnSeat === targetSeatIndex ? TURN_DURATION_MS : state.turnRemainingMs,
      hostId: nextHostId,
      lastEvent: `${eliminatedSeat?.name || 'Player'} eliminated (3/3 missed) · ${
        nextPlayer?.name || 'Next'
      }'s turn`,
      turnSequence: state.turnSequence + 1,
    },
    sound: 'capture',
    newHostId: newHostTransferredTo,
  };
}

/**
 * Escalates a missed/disconnected turn to Strike 1/3, 2/3, or 3/3 (Auto-Bot).
 * Elimination triggers automatically after Strike 3/3 completes if the player has not returned.
 */
export function applyTurnStrikeOrEliminate(
  state: GameState
): { state: GameState; eliminated: boolean; sound: SoundCue; newHostId?: string } {
  const seatIdx = state.currentTurnSeat;
  const seat = state.seats[seatIdx];
  if (!seat || seat.type !== 'human' || seat.eliminated || state.phase === 'GAME_OVER') {
    return { state, eliminated: false, sound: 'none' };
  }

  const currentStrikes = seat.strikes ?? 0;
  if (currentStrikes >= 3) {
    const elim = eliminateSeatFromGame(state, seatIdx);
    return {
      state: elim.state,
      eliminated: true,
      sound: elim.sound,
      newHostId: elim.newHostId,
    };
  }

  const nextStrikes = currentStrikes + 1;
  const updatedSeats = state.seats.map((s) =>
    s.seatIndex === seatIdx
      ? { ...s, strikes: nextStrikes, autoBotActive: true }
      : s
  );

  return {
    state: {
      ...state,
      seats: updatedSeats,
      autoBotPlayingSeat: seatIdx,
      lastEvent: `${seat.name} reconnecting... Auto-Bot ${nextStrikes}/3`,
      turnSequence: state.turnSequence + 1,
    },
    eliminated: false,
    sound: 'none',
  };
}

/**
 * Resets strike count to 0 and restores full manual control when a player acts or reconnects.
 */
export function clearSeatStrikes(
  state: GameState,
  seatIndex: number,
  playerName?: string
): GameState {
  const target = state.seats[seatIndex];
  if (!target || target.eliminated) return state;

  const needsUpdate =
    (target.strikes ?? 0) > 0 ||
    target.autoBotActive ||
    !target.connected ||
    (playerName && target.name !== playerName) ||
    state.autoBotPlayingSeat === seatIndex;

  if (!needsUpdate) return state;

  const updatedSeats = state.seats.map((s) =>
    s.seatIndex === seatIndex
      ? {
          ...s,
          name: playerName || s.name,
          connected: true,
          strikes: 0,
          autoBotActive: false,
        }
      : s
  );

  return {
    ...state,
    seats: updatedSeats,
    autoBotPlayingSeat:
      state.autoBotPlayingSeat === seatIndex ? null : state.autoBotPlayingSeat,
  };
}

/**
 * Smart tactical AI bot move evaluator.
 * Evaluates captures, home finishes, yard exits, safe squares, escape from danger, and progress.
 */
export function chooseBotMove(state: GameState): number {
  const legal = state.legalTokenIndices;
  if (legal.length === 0) return 0;
  if (legal.length === 1) return legal[0];

  const seatIdx = state.currentTurnSeat;
  const dice = state.diceValue ?? 1;

  let bestToken = legal[0];
  let bestScore = -Infinity;

  for (const tokenIndex of legal) {
    const token = state.tokens.find(
      (t) => t.seatIndex === seatIdx && t.tokenIndex === tokenIndex
    );
    if (!token) continue;

    let score = 0;

    // 1. Opening from yard
    if (token.step === -1 && dice === 6) {
      score += 85;
    } else {
      const nextStep = token.step + dice;

      // 2. Finishing a token into center Home
      if (nextStep === 56) {
        score += 140;
      } else if (nextStep >= 51) {
        // Safe inside own home column
        score += 65 + nextStep * 0.6;
      } else {
        const targetGlobal = getGlobalTrackIndex(seatIdx, nextStep);
        const currentGlobal = getGlobalTrackIndex(seatIdx, token.step);

        // 3. Capturing an opponent token
        if (targetGlobal !== null && !SAFE_TRACK_INDICES.has(targetGlobal)) {
          const hitsOpponent = state.tokens.some(
            (other) =>
              other.seatIndex !== seatIdx &&
              getGlobalTrackIndex(other.seatIndex, other.step) === targetGlobal
          );
          if (hitsOpponent) score += 165;
        }

        // 4. Landing on a safe square
        if (targetGlobal !== null && SAFE_TRACK_INDICES.has(targetGlobal)) {
          score += 55;
        }

        // 5. Threat assessment: leaving danger vs entering danger
        if (currentGlobal !== null && !SAFE_TRACK_INDICES.has(currentGlobal)) {
          const threatenedNow = isSquareThreatened(state.tokens, seatIdx, currentGlobal);
          if (threatenedNow) score += 45;
        }
        if (targetGlobal !== null && !SAFE_TRACK_INDICES.has(targetGlobal)) {
          const threatenedAfter = isSquareThreatened(state.tokens, seatIdx, targetGlobal);
          if (threatenedAfter) score -= 42;
        }

        // 6. General forward progress preference
        score += nextStep * 0.8;
      }
    }

    // Tiny deterministic tie-breaker jitter so identical tokens look natural
    score += Math.random() * 0.5;

    if (score > bestScore) {
      bestScore = score;
      bestToken = tokenIndex;
    }
  }

  return bestToken;
}

function isSquareThreatened(
  tokens: TokenState[],
  mySeat: number,
  targetGlobal: number
): boolean {
  for (const other of tokens) {
    if (other.seatIndex === mySeat || other.step < 0 || other.step > 50) continue;
    const otherGlobal = getGlobalTrackIndex(other.seatIndex, other.step);
    if (otherGlobal === null) continue;
    const dist = (targetGlobal - otherGlobal + 52) % 52;
    if (dist >= 1 && dist <= 6) {
      return true;
    }
  }
  return false;
}
