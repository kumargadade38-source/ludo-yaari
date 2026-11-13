import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bot,
  Copy,
  Check,
  LogOut,
  Play,
  PlugZap,
  RefreshCw,
  Trash2,
  Users,
  Volume2,
  VolumeX,
  Wifi,
  Pencil,
  History,
  Loader2,
  Crown,
  Dices,
  Mic,
  MicOff,
  ShieldCheck,
} from 'lucide-react';
import { AdMobBanner } from './components/AdMobBanner';
import { DiceControl } from './components/DiceControl';
import { LudoBoard } from './components/LudoBoard';
import { PrivacyModal } from './components/PrivacyModal';
import { VictoryModal } from './components/VictoryModal';
import { WelcomeModal } from './components/WelcomeModal';
import { COLOR_THEMES, PLAYER_COLORS } from './engine/boardGeometry';
import {
  TURN_DURATION_MS,
  applyDiceRoll,
  applyTokenMove,
  applyTurnStrikeOrEliminate,
  chooseBotMove,
  clearSeatStrikes,
  createBotMatchSeats,
  createInitialGameState,
} from './engine/ludoEngine';
import { LudoPeerManager } from './network/peerManager';
import {
  ActiveOnlineSession,
  FriendEntry,
  GameState,
  PlayerProfile,
  PlayerSeat,
  SoundCue,
} from './types/ludo';
import { registerAdMobGlobal, showInterstitialAd } from './utils/admob';
import { soundEngine } from './utils/sound';
import {
  addOrUpdateFriend,
  clearActiveOnlineSession,
  clearAllLocalData,
  isValidSixDigitId,
  loadActiveOnlineSession,
  loadFriendsList,
  loadMutedPreference,
  loadPlayerProfile,
  removeFriend,
  saveActiveOnlineSession,
  saveMutedPreference,
  savePlayerProfile,
} from './utils/storage';

type AppView = 'lobby' | 'playing';

function createInitialOnlineSeats(hostProfile: PlayerProfile): PlayerSeat[] {
  return PLAYER_COLORS.map((color, idx) =>
    idx === 0
      ? {
          seatIndex: 0,
          color,
          type: 'human',
          id: hostProfile.id,
          name: hostProfile.name,
          connected: true,
          finishedRank: null,
        }
      : {
          seatIndex: idx,
          color,
          type: 'empty',
          id: '',
          name: '',
          connected: false,
          finishedRank: null,
        }
  );
}

// Seat fill order (with Bottom-Left local perspective):
// 2P -> [0, 2] (Player 1 at Bottom-Left, Player 2 diagonally opposite at Top-Right)
// 3P -> [0, 2, 1] (Player 1 at Bottom-Left, Players 2 & 3 at Top-Right & Top-Left)
// 4P -> [0, 2, 1, 3] (all 4 corners)
const SEAT_FILL_ORDER = [2, 1, 3];
const DISPLAY_SEAT_ORDER = [0, 2, 1, 3];

export default function App() {
  const [profile, setProfile] = useState<PlayerProfile | null>(() => loadPlayerProfile());
  const [editingName, setEditingName] = useState(false);
  const [friends, setFriends] = useState<FriendEntry[]>(() => loadFriendsList());
  const [muted, setMuted] = useState<boolean>(() => {
    const m = loadMutedPreference();
    soundEngine.setMuted(m);
    return m;
  });

  const [view, setView] = useState<AppView>('lobby');

  // Offline Bot config
  const [botCount, setBotCount] = useState<1 | 2 | 3>(3);

  // Online Multiplayer Lobby state
  const [peerReady, setPeerReady] = useState(false);
  const [peerError, setPeerError] = useState('');
  const [peerNotice, setPeerNotice] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectingTargetId, setConnectingTargetId] = useState<string | null>(null);
  const [joinIdInput, setJoinIdInput] = useState('');
  const [onlineRole, setOnlineRole] = useState<'host' | 'guest'>('host');
  const [hostRoomId, setHostRoomId] = useState<string>('');
  const [lobbySeats, setLobbySeats] = useState<PlayerSeat[]>(() =>
    profile ? createInitialOnlineSeats(profile) : []
  );
  const [copiedRoomId, setCopiedRoomId] = useState(false);
  const [pendingInvite, setPendingInvite] = useState<PlayerProfile | null>(null);

  // Active Game state
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [isRollingAnim, setIsRollingAnim] = useState(false);
  const [confirmLeaveOpen, setConfirmLeaveOpen] = useState(false);
  const [turnSecondsLeft, setTurnSecondsLeft] = useState<number | null>(null);
  const [localReconnecting, setLocalReconnecting] = useState(false);
  const [activeSession, setActiveSession] = useState<ActiveOnlineSession | null>(() =>
    loadActiveOnlineSession(profile?.id)
  );
  const [isRejoining, setIsRejoining] = useState(false);
  const [inLobby, setInLobby] = useState<boolean>(() =>
    Boolean(loadActiveOnlineSession(profile?.id))
  );

  // Secret Private Voice Chat state (strictly local-only; never broadcast or shown to others)
  const [micEnabled, setMicEnabled] = useState(false);
  const [speakerEnabled, setSpeakerEnabled] = useState(true);
  const [voiceError, setVoiceError] = useState('');
  const [privacyOpen, setPrivacyOpen] = useState(false);

  // Refs for fresh state inside PeerJS & timer callbacks
  const peerManagerRef = useRef<LudoPeerManager | null>(null);
  const profileRef = useRef<PlayerProfile | null>(profile);
  const viewRef = useRef<AppView>(view);
  const inLobbyRef = useRef<boolean>(inLobby);
  const onlineRoleRef = useRef<'host' | 'guest'>(onlineRole);
  const hostRoomIdRef = useRef<string>(hostRoomId);
  const lobbySeatsRef = useRef<PlayerSeat[]>(lobbySeats);
  const gameStateRef = useRef<GameState | null>(gameState);
  const privacyOpenRef = useRef<boolean>(privacyOpen);
  const editingNameRef = useRef<boolean>(editingName);
  const confirmLeaveOpenRef = useRef<boolean>(confirmLeaveOpen);
  const matchHistoryGuardRef = useRef<boolean>(false);
  const handleBackToLobbyRef = useRef<() => void>(() => {});
  const prevTurnAlertRef = useRef<{ seat: number; seq: number } | null>(null);
  const turnDeadlineLocalRef = useRef<number | null>(null);
  const lastSeqSyncedRef = useRef<number>(0);
  const interstitialFiredRef = useRef<number | null>(null);
  const hasShownInterstitialRef = useRef(false);
  const timersRef = useRef<number[]>([]);
  const isRejoiningRef = useRef<boolean>(false);
  const pendingAutoRejoinRef = useRef<boolean>(false);
  const rejoinTargetsRef = useRef<string[]>([]);
  const rejoinIndexRef = useRef<number>(0);
  const rejoinRetryTimerRef = useRef<number | null>(null);

  profileRef.current = profile;
  viewRef.current = view;
  inLobbyRef.current = inLobby;
  onlineRoleRef.current = onlineRole;
  hostRoomIdRef.current = hostRoomId;
  lobbySeatsRef.current = lobbySeats;
  gameStateRef.current = gameState;
  privacyOpenRef.current = privacyOpen;
  editingNameRef.current = editingName;
  confirmLeaveOpenRef.current = confirmLeaveOpen;

  const scheduleTimer = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timersRef.current = timersRef.current.filter((t) => t !== id);
      fn();
    }, ms);
    timersRef.current.push(id);
    return id;
  }, []);

  const clearAllTimers = useCallback(() => {
    timersRef.current.forEach((t) => window.clearTimeout(t));
    timersRef.current = [];
  }, []);

  useEffect(() => {
    registerAdMobGlobal();
    soundEngine.initAutoUnlock();

    const handleContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }
      e.preventDefault();
    };

    const handleGestureStart = (e: Event) => {
      e.preventDefault();
    };

    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('gesturestart', handleGestureStart);
    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('gesturestart', handleGestureStart);
      clearAllTimers();
    };
  }, [clearAllTimers]);

  // Screen Wake Lock API: keep mobile screen awake during active matches & re-acquire on visibility return
  useEffect(() => {
    if (view !== 'playing' || gameState?.phase === 'GAME_OVER') {
      return;
    }

    let released = false;
    let wakeSentinel: { release: () => Promise<void> } | null = null;

    const acquireWakeLock = async () => {
      if (released || document.visibilityState !== 'visible') return;
      try {
        const nav = navigator as Navigator & {
          wakeLock?: {
            request: (type: 'screen') => Promise<{ release: () => Promise<void> }>;
          };
        };
        if (nav.wakeLock && typeof nav.wakeLock.request === 'function') {
          wakeSentinel = await nav.wakeLock.request('screen');
        }
      } catch {
        // Ignore on unsupported browsers, low-power mode, or non-secure contexts
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !released) {
        acquireWakeLock();
      }
    };

    acquireWakeLock();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      released = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeSentinel) {
        wakeSentinel.release().catch(() => {});
        wakeSentinel = null;
      }
    };
  }, [view, gameState?.phase]);

  // Android Hardware Back Button Protection (popstate + WebView/Cordova backbutton)
  useEffect(() => {
    if (view === 'playing') {
      if (!matchHistoryGuardRef.current) {
        try {
          window.history.pushState({ ludoMatchGuard: true }, '');
          matchHistoryGuardRef.current = true;
        } catch {
          // ignore history restrictions
        }
      }
    } else {
      matchHistoryGuardRef.current = false;
    }
  }, [view]);

  useEffect(() => {
    const handleHardwareBack = (e?: Event) => {
      if (privacyOpenRef.current) {
        e?.preventDefault?.();
        setPrivacyOpen(false);
        if (viewRef.current === 'playing') {
          try {
            window.history.pushState({ ludoMatchGuard: true }, '');
          } catch {
            // ignore
          }
        }
        return;
      }

      if (editingNameRef.current && profileRef.current) {
        e?.preventDefault?.();
        setEditingName(false);
        return;
      }

      if (viewRef.current === 'playing') {
        e?.preventDefault?.();
        if (gameStateRef.current?.phase === 'GAME_OVER') {
          matchHistoryGuardRef.current = false;
          handleBackToLobbyRef.current();
          return;
        }

        if (confirmLeaveOpenRef.current) {
          setConfirmLeaveOpen(false);
        } else {
          setConfirmLeaveOpen(true);
        }

        try {
          window.history.pushState({ ludoMatchGuard: true }, '');
          matchHistoryGuardRef.current = true;
        } catch {
          // ignore
        }
      }
    };

    const onPopState = () => {
      handleHardwareBack();
    };

    const onBackButton = (e: Event) => {
      handleHardwareBack(e);
    };

    window.addEventListener('popstate', onPopState);
    document.addEventListener('backbutton', onBackButton);
    return () => {
      window.removeEventListener('popstate', onPopState);
      document.removeEventListener('backbutton', onBackButton);
    };
  }, []);

  // Trigger AdMob Interstitial once when a match finishes
  useEffect(() => {
    if (gameState?.phase === 'GAME_OVER') {
      if (interstitialFiredRef.current !== gameState.turnSequence) {
        interstitialFiredRef.current = gameState.turnSequence;
        hasShownInterstitialRef.current = true;
        scheduleTimer(() => {
          showInterstitialAd();
        }, 450);
      }
    } else {
      interstitialFiredRef.current = null;
    }
  }, [gameState?.phase, gameState?.turnSequence, scheduleTimer]);

  // Auto-save friend to Recent / Saved Friends History whenever connected
  const rememberFriend = useCallback((id: string, name: string) => {
    const myId = profileRef.current?.id;
    if (!id || id === myId || !isValidSixDigitId(id) || !name.trim()) return;
    setFriends(addOrUpdateFriend(id, name));
  }, []);

  // Helper for Host to sync lobby seats to all connected guests
  const broadcastLobbySeats = useCallback((seats: PlayerSeat[]) => {
    const p = profileRef.current;
    if (!p || !peerManagerRef.current) return;
    peerManagerRef.current.broadcast({
      type: 'LOBBY_SYNC',
      seats,
      hostId: p.id,
    });
  }, []);

  // Keep LocalStorage active online match session synced with live match state
  const syncActiveSessionForGameState = useCallback((gs: GameState) => {
    const myId = profileRef.current?.id;
    if (!myId || gs.mode !== 'online') return;

    const mySeat = gs.seats.find((s) => s.type === 'human' && s.id === myId);
    if (gs.phase === 'GAME_OVER' || !mySeat || mySeat.eliminated) {
      clearActiveOnlineSession();
      setActiveSession(null);
      return;
    }

    const effectiveHostId =
      gs.hostId || hostRoomIdRef.current || gs.seats[0]?.id || myId;
    const hostSeat = gs.seats.find((s) => s.id === effectiveHostId);
    const candidateHostIds = gs.seats
      .filter((s) => s.type === 'human' && !s.eliminated && s.id !== myId)
      .sort((a, b) => a.seatIndex - b.seatIndex)
      .map((s) => s.id);

    const session: ActiveOnlineSession = {
      hostId: effectiveHostId,
      seatIndex: mySeat.seatIndex,
      playerId: myId,
      hostName: hostSeat?.name || 'Host',
      candidateHostIds,
      startedAt: Date.now(),
    };
    saveActiveOnlineSession(session);
    setActiveSession(session);
  }, []);

  const clearRejoinTimer = useCallback(() => {
    if (rejoinRetryTimerRef.current !== null) {
      window.clearTimeout(rejoinRetryTimerRef.current);
      rejoinRetryTimerRef.current = null;
    }
  }, []);

  const stopRejoinAttempt = useCallback(() => {
    clearRejoinTimer();
    isRejoiningRef.current = false;
    pendingAutoRejoinRef.current = false;
    setIsRejoining(false);
    setIsConnecting(false);
    setConnectingTargetId(null);
  }, [clearRejoinTimer]);

  const attemptRejoinTarget = useCallback(
    (idx: number) => {
      const myProfile = profileRef.current;
      const targets = rejoinTargetsRef.current;
      if (!myProfile || idx >= targets.length) {
        clearRejoinTimer();
        isRejoiningRef.current = false;
        pendingAutoRejoinRef.current = false;
        setIsRejoining(false);
        setIsConnecting(false);
        setConnectingTargetId(null);
        setPeerNotice('');
        if (myProfile) {
          const resetSeats = createInitialOnlineSeats(myProfile);
          onlineRoleRef.current = 'host';
          hostRoomIdRef.current = myProfile.id;
          lobbySeatsRef.current = resetSeats;
          setOnlineRole('host');
          setHostRoomId(myProfile.id);
          setLobbySeats(resetSeats);
        }
        setPeerError(
          'Could not reach the active match right now. Tap Rejoin to retry or Leave Match.'
        );
        return;
      }

      const targetId = targets[idx];
      rejoinIndexRef.current = idx;
      onlineRoleRef.current = 'guest';
      hostRoomIdRef.current = targetId;
      setOnlineRole('guest');
      setHostRoomId(targetId);
      setIsConnecting(true);
      setConnectingTargetId(targetId);
      setPeerError('');
      setPeerNotice(`Reconnecting to Room #${targetId}...`);

      peerManagerRef.current?.closeAllConnections();
      peerManagerRef.current?.connectToFriend(targetId, { skipHello: true });

      clearRejoinTimer();
      rejoinRetryTimerRef.current = window.setTimeout(() => {
        rejoinRetryTimerRef.current = null;
        if (isRejoiningRef.current && rejoinIndexRef.current === idx) {
          attemptRejoinTarget(idx + 1);
        }
      }, 4800);
    },
    [clearRejoinTimer]
  );

  // Helper for Host to commit & broadcast authoritative GameState
  const commitAndBroadcastState = useCallback(
    (nextState: GameState, sound: SoundCue = 'none', soundSteps?: number) => {
      gameStateRef.current = nextState;
      setGameState(nextState);
      syncActiveSessionForGameState(nextState);
      if (sound !== 'none') {
        soundEngine.play(sound, soundSteps);
      }
      if (nextState.mode === 'online' && onlineRoleRef.current === 'host') {
        peerManagerRef.current?.broadcast({
          type: 'STATE_SYNC',
          state: nextState,
          soundCue: sound,
          soundSteps,
        });
      }
    },
    [syncActiveSessionForGameState]
  );

  const commitTransitionResult = useCallback(
    (nextState: GameState, sound: SoundCue = 'none', newHostId?: string, soundSteps?: number) => {
      if (newHostId && nextState.mode === 'online') {
        peerManagerRef.current?.broadcast({
          type: 'HOST_TRANSFER',
          newHostId,
          state: nextState,
        });
        onlineRoleRef.current = 'guest';
        hostRoomIdRef.current = newHostId;
        setOnlineRole('guest');
        setHostRoomId(newHostId);
        gameStateRef.current = nextState;
        setGameState(nextState);
        syncActiveSessionForGameState(nextState);
        if (sound !== 'none') soundEngine.play(sound, soundSteps);
        scheduleTimer(() => {
          peerManagerRef.current?.closeAllConnections();
          peerManagerRef.current?.connectToFriend(newHostId);
        }, 250);
      } else {
        commitAndBroadcastState(nextState, sound, soundSteps);
      }
    },
    [commitAndBroadcastState, scheduleTimer, syncActiveSessionForGameState]
  );

  // Execute a dice roll
  const executeRollAuthoritative = useCallback(() => {
    const current = gameStateRef.current;
    if (!current || current.phase !== 'WAIT_ROLL') return;

    const remainingNow =
      current.mode === 'online' && turnDeadlineLocalRef.current
        ? Math.max(8000, turnDeadlineLocalRef.current - Date.now())
        : TURN_DURATION_MS;

    setIsRollingAnim(true);
    soundEngine.play('dice');

    const rollingView: GameState = { ...current, phase: 'ROLLING' };
    gameStateRef.current = rollingView;
    setGameState(rollingView);
    if (rollingView.mode === 'online' && onlineRoleRef.current === 'host') {
      peerManagerRef.current?.broadcast({
        type: 'STATE_SYNC',
        state: rollingView,
        soundCue: 'dice',
      });
    }

    scheduleTimer(() => {
      const latest = gameStateRef.current;
      if (!latest || latest.phase !== 'ROLLING') {
        setIsRollingAnim(false);
        return;
      }
      const { state: rolledState, sound: rollSound, newHostId } = applyDiceRoll(
        latest,
        undefined,
        remainingNow
      );
      setIsRollingAnim(false);
      // Dice rattle already played on roll start; chime cleanly if a 6 was rolled (or elimination cue)
      const settleSound: SoundCue = rollSound === 'dice' ? 'none' : rollSound;
      commitTransitionResult(rolledState, settleSound, newHostId);
    }, 380);
  }, [commitTransitionResult, scheduleTimer]);

  const executeMoveAuthoritative = useCallback(
    (tokenIndex: number) => {
      const current = gameStateRef.current;
      if (!current || current.phase !== 'WAIT_MOVE') return;
      const stepsMoved = current.diceValue ?? 3;
      const { state: nextState, sound, newHostId } = applyTokenMove(current, tokenIndex);
      if (nextState.turnSequence !== current.turnSequence) {
        commitTransitionResult(nextState, sound, newHostId, stepsMoved);
      }
    },
    [commitTransitionResult]
  );

  // Authoritative 30s timeout escalation (3-round Auto-Bot 1/3, 2/3, 3/3 -> Elimination after 3rd)
  const handleTurnTimeoutAuthoritative = useCallback(() => {
    const latest = gameStateRef.current;
    if (
      !latest ||
      latest.mode !== 'online' ||
      latest.phase === 'GAME_OVER' ||
      latest.phase === 'ROLLING' ||
      latest.autoBotPlayingSeat != null
    ) {
      return;
    }

    const { state: nextState, sound, newHostId } = applyTurnStrikeOrEliminate(latest);
    if (nextState.turnSequence === latest.turnSequence) return;
    commitTransitionResult(nextState, sound, newHostId);
  }, [commitTransitionResult]);

  // Initialize PeerJS whenever profile exists
  const initPeer = useCallback(
    (activeProfile: PlayerProfile) => {
      setPeerReady(false);
      setPeerError('');

      if (!peerManagerRef.current) {
        peerManagerRef.current = new LudoPeerManager({
          onReady: (sixDigitId) => {
            setPeerReady(true);
            setPeerError('');
            setHostRoomId((prev) => prev || sixDigitId);
            if (pendingAutoRejoinRef.current && isRejoiningRef.current) {
              pendingAutoRejoinRef.current = false;
              scheduleTimer(() => {
                if (isRejoiningRef.current) {
                  attemptRejoinTarget(0);
                }
              }, 120);
            }
          },
          onConnectionOpen: (remoteId) => {
            setIsConnecting(false);
            setConnectingTargetId(null);
            setLocalReconnecting(false);
            setPeerError('');
            if (isRejoiningRef.current && profileRef.current) {
              clearRejoinTimer();
              inLobbyRef.current = false;
              setInLobby(false);
              peerManagerRef.current?.sendTo(remoteId, {
                type: 'PLAYER_REJOINED',
                profile: profileRef.current,
              });
            }
          },
          onMessage: (remoteId, msg) => {
            const myProfile = profileRef.current;
            if (!myProfile) return;

            if (msg.type === 'PING') {
              peerManagerRef.current?.sendTo(remoteId, { type: 'PONG' });
              return;
            }
            if (msg.type === 'PONG') {
              return;
            }

            if (msg.type === 'INVITE') {
              rememberFriend(msg.hostProfile.id, msg.hostProfile.name);
              if (viewRef.current === 'lobby') {
                setPendingInvite(msg.hostProfile);
              }
              return;
            }

            const buildRestoredStateForPlayer = (
              gs: GameState,
              seatIdx: number,
              playerName: string,
              activeHostId: string
            ): GameState => {
              const restored = clearSeatStrikes(gs, seatIdx, playerName);
              const safePhase = restored.phase === 'ROLLING' ? 'WAIT_ROLL' : restored.phase;
              const clearedAutoSeat =
                restored.autoBotPlayingSeat === seatIdx ? null : restored.autoBotPlayingSeat;
              const freshTurnMs =
                restored.currentTurnSeat === seatIdx
                  ? TURN_DURATION_MS
                  : turnDeadlineLocalRef.current
                  ? Math.max(1500, turnDeadlineLocalRef.current - Date.now())
                  : restored.turnRemainingMs;
              return {
                ...restored,
                phase: safePhase,
                autoBotPlayingSeat: clearedAutoSeat,
                turnRemainingMs: freshTurnMs,
                hostId: activeHostId,
                lastEvent: `${playerName} rejoined! Control restored`,
                turnSequence: gs.turnSequence + 1,
              };
            };

            if (msg.type === 'PLAYER_AWAY') {
              if (
                onlineRoleRef.current === 'host' &&
                viewRef.current === 'playing' &&
                gameStateRef.current?.mode === 'online' &&
                gameStateRef.current.phase !== 'GAME_OVER'
              ) {
                const gs = gameStateRef.current;
                const awaySeat = gs.seats.find((s) => s.id === msg.playerId);
                if (awaySeat && !awaySeat.eliminated && awaySeat.connected) {
                  const preservedRemaining = turnDeadlineLocalRef.current
                    ? Math.max(1500, turnDeadlineLocalRef.current - Date.now())
                    : gs.turnRemainingMs;
                  commitAndBroadcastState(
                    {
                      ...gs,
                      seats: gs.seats.map((s) =>
                        s.id === msg.playerId ? { ...s, connected: false } : s
                      ),
                      turnRemainingMs: preservedRemaining,
                      lastEvent: `${awaySeat.name} is away in Lobby · Reconnecting...`,
                      turnSequence: gs.turnSequence + 1,
                    },
                    'none'
                  );
                }
              }
              return;
            }

            if (msg.type === 'REJOIN_REQUEST' || msg.type === 'PLAYER_REJOINED') {
              rememberFriend(msg.profile.id, msg.profile.name);

              // If this device itself is currently parked away in Lobby, never handle or switch screen
              if (inLobbyRef.current && !isRejoiningRef.current) {
                return;
              }

              if (
                viewRef.current !== 'playing' ||
                !gameStateRef.current ||
                gameStateRef.current.mode !== 'online' ||
                gameStateRef.current.phase === 'GAME_OVER'
              ) {
                peerManagerRef.current?.sendTo(remoteId, {
                  type: 'REJOIN_REJECTED',
                  reason: 'This match has already ended.',
                });
                return;
              }

              const gs = gameStateRef.current;
              const gameSeatIdx = gs.seats.findIndex((s) => s.id === msg.profile.id);
              if (gameSeatIdx < 0) {
                peerManagerRef.current?.sendTo(remoteId, {
                  type: 'REJOIN_REJECTED',
                  reason: 'Your player slot is not part of this active match.',
                });
                return;
              }

              const seat = gs.seats[gameSeatIdx];
              if (seat.eliminated) {
                peerManagerRef.current?.sendTo(remoteId, {
                  type: 'REJOIN_REJECTED',
                  reason: 'You were eliminated after 3 missed turns.',
                });
                return;
              }

              if (onlineRoleRef.current === 'host') {
                const updatedState = buildRestoredStateForPlayer(
                  gs,
                  gameSeatIdx,
                  msg.profile.name,
                  myProfile.id
                );
                commitAndBroadcastState(updatedState, 'open');
                peerManagerRef.current?.sendTo(remoteId, {
                  type: 'GAME_START',
                  state: updatedState,
                });
                peerManagerRef.current?.syncVoiceMeshPeers(
                  updatedState.seats
                    .filter((s) => s.type === 'human' && !s.eliminated && s.id !== myProfile.id)
                    .map((s) => s.id),
                  msg.profile.id
                );
                return;
              }

              // Guest holding active match when original Host reloads and rejoins first
              if (gs.hostId === msg.profile.id) {
                onlineRoleRef.current = 'host';
                hostRoomIdRef.current = myProfile.id;
                setOnlineRole('host');
                setHostRoomId(myProfile.id);
                const updatedState = buildRestoredStateForPlayer(
                  gs,
                  gameSeatIdx,
                  msg.profile.name,
                  myProfile.id
                );
                updatedState.lastEvent = `${msg.profile.name} rejoined! Host passed to ${myProfile.name}`;
                commitAndBroadcastState(updatedState, 'open');
                peerManagerRef.current?.sendTo(remoteId, {
                  type: 'GAME_START',
                  state: updatedState,
                });
                peerManagerRef.current?.syncVoiceMeshPeers(
                  updatedState.seats
                    .filter((s) => s.type === 'human' && !s.eliminated && s.id !== myProfile.id)
                    .map((s) => s.id),
                  msg.profile.id
                );
                return;
              }

              // Redirect rejoining player to current Host if Host migrated to another guest
              if (gs.hostId && gs.hostId !== myProfile.id) {
                peerManagerRef.current?.sendTo(remoteId, {
                  type: 'HOST_TRANSFER',
                  newHostId: gs.hostId,
                  state: gs,
                });
              }
              return;
            }

            if (msg.type === 'REJOIN_REJECTED') {
              stopRejoinAttempt();
              clearActiveOnlineSession();
              setActiveSession(null);
              peerManagerRef.current?.closeConnection(remoteId);
              const resetSeats = createInitialOnlineSeats(myProfile);
              onlineRoleRef.current = 'host';
              hostRoomIdRef.current = myProfile.id;
              lobbySeatsRef.current = resetSeats;
              setOnlineRole('host');
              setHostRoomId(myProfile.id);
              setLobbySeats(resetSeats);
              setPeerNotice('');
              setPeerError(msg.reason);
              return;
            }

            if (msg.type === 'HELLO') {
              // Automatically save connecting friend's Name & 6-digit ID
              rememberFriend(msg.profile.id, msg.profile.name);

              if (onlineRoleRef.current === 'host') {
                const currentLobby = lobbySeatsRef.current;
                const existingSeat = currentLobby.find(
                  (s) => s.type === 'human' && s.id === msg.profile.id
                );

                // Seamless reconnect mid-match: restore full control & reset strikes to 0
                if (
                  viewRef.current === 'playing' &&
                  gameStateRef.current?.mode === 'online'
                ) {
                  const gs = gameStateRef.current;
                  const gameSeatIdx = gs.seats.findIndex(
                    (s) => s.id === msg.profile.id
                  );
                  if (gameSeatIdx >= 0) {
                    const seat = gs.seats[gameSeatIdx];
                    if (seat.eliminated) {
                      peerManagerRef.current?.sendTo(remoteId, {
                        type: 'REJOIN_REJECTED',
                        reason: 'You were eliminated after 3 missed turns.',
                      });
                      return;
                    }
                    const updatedState = buildRestoredStateForPlayer(
                      gs,
                      gameSeatIdx,
                      msg.profile.name,
                      myProfile.id
                    );
                    commitAndBroadcastState(updatedState, 'open');
                    peerManagerRef.current?.sendTo(remoteId, {
                      type: 'GAME_START',
                      state: updatedState,
                    });
                    peerManagerRef.current?.syncVoiceMeshPeers(
                      updatedState.seats
                        .filter((s) => s.type === 'human' && !s.eliminated && s.id !== myProfile.id)
                        .map((s) => s.id),
                      msg.profile.id
                    );
                    return;
                  }
                  peerManagerRef.current?.sendTo(remoteId, { type: 'ROOM_FULL' });
                  return;
                }

                if (existingSeat) {
                  const updated = currentLobby.map((s) =>
                    s.seatIndex === existingSeat.seatIndex
                      ? { ...s, name: msg.profile.name, connected: true }
                      : s
                  );
                  lobbySeatsRef.current = updated;
                  setLobbySeats(updated);
                  broadcastLobbySeats(updated);
                  return;
                }

                const openSeatIdx = SEAT_FILL_ORDER.find(
                  (idx) => currentLobby[idx] && currentLobby[idx].type !== 'human'
                );

                if (openSeatIdx === undefined) {
                  peerManagerRef.current?.sendTo(remoteId, { type: 'ROOM_FULL' });
                  return;
                }

                const updated = currentLobby.map((s) =>
                  s.seatIndex === openSeatIdx
                    ? {
                        ...s,
                        type: 'human' as const,
                        id: msg.profile.id,
                        name: msg.profile.name,
                        connected: true,
                      }
                    : s
                );
                lobbySeatsRef.current = updated;
                setLobbySeats(updated);
                broadcastLobbySeats(updated);
              }
            } else if (msg.type === 'LOBBY_SYNC') {
              // Joining a fresh online lobby clears any stale rejoin/away state
              inLobbyRef.current = false;
              setInLobby(false);
              clearActiveOnlineSession();
              setActiveSession(null);

              // Automatically save host's Name & 6-digit ID on guest side
              const hostSeat = msg.seats.find((s) => s.id === msg.hostId);
              if (hostSeat) {
                rememberFriend(hostSeat.id, hostSeat.name);
              }

              onlineRoleRef.current = 'guest';
              hostRoomIdRef.current = msg.hostId;
              lobbySeatsRef.current = msg.seats;
              setOnlineRole('guest');
              setHostRoomId(msg.hostId);
              setLobbySeats(msg.seats);
              setIsConnecting(false);
              setConnectingTargetId(null);
              setPeerError('');
              setPendingInvite(null);
            } else if (msg.type === 'ROOM_FULL') {
              stopRejoinAttempt();
              const resetSeats = createInitialOnlineSeats(myProfile);
              onlineRoleRef.current = 'host';
              hostRoomIdRef.current = myProfile.id;
              lobbySeatsRef.current = resetSeats;
              setIsConnecting(false);
              setConnectingTargetId(null);
              setOnlineRole('host');
              setHostRoomId(myProfile.id);
              setLobbySeats(resetSeats);
              setPeerError('That room already has 4 players.');
              peerManagerRef.current?.closeConnection(remoteId);
            } else if (msg.type === 'GAME_START') {
              // STRICT LOBBY GUARD: If player exited to Lobby and has NOT tapped Rejoin, stay in Lobby!
              if (inLobbyRef.current && !isRejoiningRef.current) {
                return;
              }

              const wasExplicitRejoin = isRejoiningRef.current;
              clearAllTimers();
              stopRejoinAttempt();
              inLobbyRef.current = false;
              setInLobby(false);
              setIsRollingAnim(false);
              lastSeqSyncedRef.current = 0;
              setPeerNotice('');
              hasShownInterstitialRef.current = false;
              setLocalReconnecting(false);

              const incomingHostId = msg.state.hostId || remoteId;
              if (incomingHostId === myProfile.id) {
                onlineRoleRef.current = 'host';
                hostRoomIdRef.current = myProfile.id;
                setOnlineRole('host');
                setHostRoomId(myProfile.id);
              } else {
                onlineRoleRef.current = 'guest';
                hostRoomIdRef.current = incomingHostId;
                setOnlineRole('guest');
                setHostRoomId(incomingHostId);
              }

              // Locally clear any leftover disconnect/Auto-Bot/ROLLING lock flags for returning player
              const mySeatIdx = msg.state.seats.findIndex((s) => s.id === myProfile.id);
              let cleanState = msg.state;
              if (mySeatIdx >= 0 && !msg.state.seats[mySeatIdx].eliminated) {
                const cleared = clearSeatStrikes(msg.state, mySeatIdx, myProfile.name);
                cleanState = {
                  ...cleared,
                  phase: cleared.phase === 'ROLLING' ? 'WAIT_ROLL' : cleared.phase,
                  autoBotPlayingSeat:
                    cleared.autoBotPlayingSeat === mySeatIdx ? null : cleared.autoBotPlayingSeat,
                };
              }

              setGameState(cleanState);
              gameStateRef.current = cleanState;
              syncActiveSessionForGameState(cleanState);
              setView('playing');
              soundEngine.play('open');

              if (wasExplicitRejoin && incomingHostId !== myProfile.id) {
                peerManagerRef.current?.sendTo(incomingHostId, {
                  type: 'PLAYER_REJOINED',
                  profile: myProfile,
                });
              }
            } else if (msg.type === 'STATE_SYNC') {
              // STRICT LOBBY GUARD: Never switch screen or overwrite Lobby when inLobby === true
              if (inLobbyRef.current || viewRef.current !== 'playing') {
                return;
              }
              setLocalReconnecting(false);
              if (msg.state.phase === 'ROLLING') {
                setIsRollingAnim(true);
              } else {
                setIsRollingAnim(false);
              }
              if (msg.state.hostId && msg.state.hostId !== hostRoomIdRef.current) {
                hostRoomIdRef.current = msg.state.hostId;
                setHostRoomId(msg.state.hostId);
              }
              setGameState(msg.state);
              gameStateRef.current = msg.state;
              syncActiveSessionForGameState(msg.state);
              if (msg.soundCue && msg.soundCue !== 'none') {
                soundEngine.play(msg.soundCue, msg.soundSteps);
              }
            } else if (msg.type === 'HOST_TRANSFER') {
              if (inLobbyRef.current && !isRejoiningRef.current) {
                return;
              }
              if (isRejoiningRef.current && msg.newHostId !== myProfile.id) {
                clearRejoinTimer();
                onlineRoleRef.current = 'guest';
                hostRoomIdRef.current = msg.newHostId;
                setOnlineRole('guest');
                setHostRoomId(msg.newHostId);
                setPeerNotice(`Redirecting to Host #${msg.newHostId}...`);
                peerManagerRef.current?.closeAllConnections();
                peerManagerRef.current?.connectToFriend(msg.newHostId, { skipHello: true });
                return;
              }
              if (viewRef.current !== 'playing') {
                return;
              }
              setIsRollingAnim(false);
              setLocalReconnecting(false);
              lastSeqSyncedRef.current = 0;
              setGameState(msg.state);
              gameStateRef.current = msg.state;
              syncActiveSessionForGameState(msg.state);
              if (msg.newHostId === myProfile.id) {
                onlineRoleRef.current = 'host';
                hostRoomIdRef.current = myProfile.id;
                setOnlineRole('host');
                setHostRoomId(myProfile.id);
              } else {
                onlineRoleRef.current = 'guest';
                hostRoomIdRef.current = msg.newHostId;
                setOnlineRole('guest');
                setHostRoomId(msg.newHostId);
                peerManagerRef.current?.closeAllConnections();
                peerManagerRef.current?.connectToFriend(msg.newHostId);
              }
            } else if (msg.type === 'MATCH_ENDED_BACK_TO_LOBBY') {
              clearAllTimers();
              stopRejoinAttempt();
              inLobbyRef.current = false;
              setInLobby(false);
              setIsRollingAnim(false);
              clearActiveOnlineSession();
              setActiveSession(null);
              setLocalReconnecting(false);
              if (!hasShownInterstitialRef.current) {
                hasShownInterstitialRef.current = true;
                showInterstitialAd();
              }
              setGameState(null);
              setView('lobby');
            } else if (msg.type === 'ACTION_ROLL') {
              if (onlineRoleRef.current !== 'host') return;
              const gs = gameStateRef.current;
              if (!gs || gs.mode !== 'online' || gs.phase !== 'WAIT_ROLL') return;
              const activeSeat = gs.seats[gs.currentTurnSeat];
              if (activeSeat?.id === msg.playerId && !activeSeat.eliminated) {
                const cleared = clearSeatStrikes(gs, gs.currentTurnSeat);
                if (cleared !== gs) {
                  gameStateRef.current = cleared;
                }
                executeRollAuthoritative();
              }
            } else if (msg.type === 'ACTION_MOVE') {
              if (onlineRoleRef.current !== 'host') return;
              const gs = gameStateRef.current;
              if (!gs || gs.mode !== 'online' || gs.phase !== 'WAIT_MOVE') return;
              const activeSeat = gs.seats[gs.currentTurnSeat];
              if (activeSeat?.id === msg.playerId && !activeSeat.eliminated) {
                const cleared = clearSeatStrikes(gs, gs.currentTurnSeat);
                if (cleared !== gs) {
                  gameStateRef.current = cleared;
                }
                executeMoveAuthoritative(msg.tokenIndex);
              }
            }
          },
          onConnectionClose: (remoteId) => {
            const myProfile = profileRef.current;
            if (!myProfile) return;

            if (onlineRoleRef.current === 'guest') {
              if (remoteId !== hostRoomIdRef.current) return;

              // During an active online match, keep player in game and auto-reconnect in background!
              if (
                viewRef.current === 'playing' &&
                gameStateRef.current?.mode === 'online' &&
                gameStateRef.current.phase !== 'GAME_OVER'
              ) {
                setLocalReconnecting(true);
                return;
              }

              const resetSeats = createInitialOnlineSeats(myProfile);
              onlineRoleRef.current = 'host';
              hostRoomIdRef.current = myProfile.id;
              lobbySeatsRef.current = resetSeats;
              setIsConnecting(false);
              setConnectingTargetId(null);
              setPeerError('Disconnected from host room.');
              setOnlineRole('host');
              setHostRoomId(myProfile.id);
              setLobbySeats(resetSeats);
              if (viewRef.current === 'playing') {
                clearAllTimers();
                setGameState(null);
                setView('lobby');
              }
            } else {
              // Ignore closes from temporary invite connections that never joined the room
              const wasInLobby = lobbySeatsRef.current.some(
                (s) => s.type === 'human' && s.id === remoteId
              );
              const wasInGame = Boolean(
                viewRef.current === 'playing' &&
                  gameStateRef.current?.mode === 'online' &&
                  gameStateRef.current.seats.some((s) => s.id === remoteId)
              );
              if (!wasInLobby && !wasInGame) return;

              // If currently in an active online match: DO NOT kick or permanently convert to bot.
              // Mark seat disconnected while preserving exact remaining turn time so Auto-Bot timer continues smoothly.
              if (
                viewRef.current === 'playing' &&
                gameStateRef.current?.mode === 'online' &&
                gameStateRef.current.phase !== 'GAME_OVER'
              ) {
                const gs = gameStateRef.current;
                const disconnectedSeat = gs.seats.find((s) => s.id === remoteId);
                if (!disconnectedSeat || disconnectedSeat.eliminated || !disconnectedSeat.connected) {
                  return;
                }

                const preservedRemaining = turnDeadlineLocalRef.current
                  ? Math.max(1500, turnDeadlineLocalRef.current - Date.now())
                  : gs.turnRemainingMs;
                const updatedGameSeats = gs.seats.map((s) =>
                  s.id === remoteId ? { ...s, connected: false } : s
                );
                const nextGs: GameState = {
                  ...gs,
                  seats: updatedGameSeats,
                  turnRemainingMs: preservedRemaining,
                  lastEvent: `${disconnectedSeat.name} connection dropped · Reconnecting...`,
                  turnSequence: gs.turnSequence + 1,
                };
                commitAndBroadcastState(nextGs, 'none');
                return;
              }

              // In lobby: compact remaining guest players cleanly into SEAT_FILL_ORDER ([2, 1, 3])
              const remainingGuests = SEAT_FILL_ORDER.map((idx) =>
                lobbySeatsRef.current.find((s) => s.seatIndex === idx)
              ).filter(
                (s): s is PlayerSeat =>
                  Boolean(s && s.type === 'human' && s.id !== remoteId)
              );

              const updatedLobby = createInitialOnlineSeats(myProfile).map((seat) => {
                if (seat.seatIndex === 0) return lobbySeatsRef.current[0] || seat;
                const slotPos = SEAT_FILL_ORDER.indexOf(seat.seatIndex);
                const guest = slotPos >= 0 ? remainingGuests[slotPos] : undefined;
                return guest
                  ? { ...guest, seatIndex: seat.seatIndex, color: seat.color }
                  : seat;
              });

              lobbySeatsRef.current = updatedLobby;
              setLobbySeats(updatedLobby);
              broadcastLobbySeats(updatedLobby);
            }
          },
          onError: (message) => {
            const myProfile = profileRef.current;
            setIsConnecting(false);
            setConnectingTargetId(null);
            if (isRejoiningRef.current && viewRef.current === 'lobby') {
              clearRejoinTimer();
              attemptRejoinTarget(rejoinIndexRef.current + 1);
              return;
            }
            if (viewRef.current === 'lobby') {
              setPeerError(message);
              if (myProfile && onlineRoleRef.current === 'guest') {
                const resetSeats = createInitialOnlineSeats(myProfile);
                onlineRoleRef.current = 'host';
                hostRoomIdRef.current = myProfile.id;
                lobbySeatsRef.current = resetSeats;
                setOnlineRole('host');
                setHostRoomId(myProfile.id);
                setLobbySeats(resetSeats);
              }
            }
          },
          onVoiceError: (message) => {
            setMicEnabled(false);
            setVoiceError(message);
            scheduleTimer(() => setVoiceError(''), 3500);
          },
        });
      }

      peerManagerRef.current.init(activeProfile);
    },
    [
      attemptRejoinTarget,
      broadcastLobbySeats,
      clearAllTimers,
      clearRejoinTimer,
      commitAndBroadcastState,
      executeMoveAuthoritative,
      executeRollAuthoritative,
      rememberFriend,
      scheduleTimer,
      stopRejoinAttempt,
      syncActiveSessionForGameState,
    ]
  );

  useEffect(() => {
    if (profile) {
      setLobbySeats((prev) =>
        prev.length === 4 ? prev : createInitialOnlineSeats(profile)
      );
      setHostRoomId(profile.id);
      initPeer(profile);
    }
    return () => {
      peerManagerRef.current?.destroy();
      peerManagerRef.current = null;
    };
  }, [profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Bot automation + 2-Strike Auto-Bot automation + single-choice human auto-move loop
  useEffect(() => {
    if (view !== 'playing' || !gameState) return;
    if (gameState.mode === 'online' && onlineRole !== 'host') return;

    const activeSeat = gameState.seats[gameState.currentTurnSeat];
    if (!activeSeat || activeSeat.type === 'empty' || activeSeat.eliminated) return;

    const isAutoBotTurn =
      gameState.mode === 'online' && gameState.autoBotPlayingSeat === activeSeat.seatIndex;

    if (activeSeat.type === 'bot' || isAutoBotTurn) {
      if (gameState.phase === 'WAIT_ROLL') {
        const t = scheduleTimer(() => {
          executeRollAuthoritative();
        }, 550);
        return () => window.clearTimeout(t);
      }
      if (gameState.phase === 'WAIT_MOVE') {
        const t = scheduleTimer(() => {
          const latest = gameStateRef.current;
          if (!latest || latest.phase !== 'WAIT_MOVE') return;
          const chosen = chooseBotMove(latest);
          executeMoveAuthoritative(chosen);
        }, 520);
        return () => window.clearTimeout(t);
      }
    } else if (activeSeat.type === 'human' && gameState.phase === 'WAIT_MOVE') {
      const legalTokens = gameState.legalTokenIndices.map((idx) =>
        gameState.tokens.find(
          (t) => t.seatIndex === activeSeat.seatIndex && t.tokenIndex === idx
        )
      );
      const uniqueSteps = new Set(legalTokens.map((t) => t?.step));
      if (legalTokens.length > 0 && uniqueSteps.size === 1) {
        const t = scheduleTimer(() => {
          const latest = gameStateRef.current;
          if (!latest || latest.phase !== 'WAIT_MOVE') return;
          executeMoveAuthoritative(latest.legalTokenIndices[0]);
        }, 420);
        return () => window.clearTimeout(t);
      }
    }
  }, [
    view,
    gameState,
    onlineRole,
    scheduleTimer,
    executeRollAuthoritative,
    executeMoveAuthoritative,
  ]);

  // Recover cleanly if a Host inherits or stalls in 'ROLLING' without a local roll animation running
  useEffect(() => {
    if (
      view !== 'playing' ||
      !gameState ||
      gameState.mode !== 'online' ||
      onlineRole !== 'host' ||
      gameState.phase !== 'ROLLING' ||
      isRollingAnim
    ) {
      return;
    }
    const t = window.setTimeout(() => {
      const latest = gameStateRef.current;
      if (
        latest &&
        latest.mode === 'online' &&
        onlineRoleRef.current === 'host' &&
        latest.phase === 'ROLLING'
      ) {
        commitAndBroadcastState(
          {
            ...latest,
            phase: 'WAIT_ROLL',
            turnRemainingMs: TURN_DURATION_MS,
            turnSequence: latest.turnSequence + 1,
          },
          'none'
        );
      }
    }, 1000);
    return () => window.clearTimeout(t);
  }, [view, gameState, onlineRole, isRollingAnim, commitAndBroadcastState]);

  // Reset local 30-second turn deadline whenever turnSequence advances (or if Host authority transfers)
  useEffect(() => {
    if (
      view !== 'playing' ||
      !gameState ||
      gameState.mode !== 'online' ||
      gameState.phase === 'GAME_OVER'
    ) {
      turnDeadlineLocalRef.current = null;
      lastSeqSyncedRef.current = 0;
      setTurnSecondsLeft(null);
      return;
    }

    if (
      gameState.phase !== 'ROLLING' &&
      gameState.autoBotPlayingSeat == null &&
      (lastSeqSyncedRef.current !== gameState.turnSequence ||
        turnDeadlineLocalRef.current === null)
    ) {
      lastSeqSyncedRef.current = gameState.turnSequence;
      const ms = gameState.turnRemainingMs ?? TURN_DURATION_MS;
      turnDeadlineLocalRef.current = Date.now() + ms;
      setTurnSecondsLeft(Math.max(0, Math.ceil(ms / 1000)));
    }
  }, [
    view,
    onlineRole,
    gameState?.mode,
    gameState?.phase,
    gameState?.turnSequence,
    gameState?.turnRemainingMs,
    gameState?.autoBotPlayingSeat,
  ]);

  // 30-second live countdown ticker + Host-authoritative timeout + instant Guest failover if Host stalls past 0s
  useEffect(() => {
    if (
      view !== 'playing' ||
      !gameState ||
      gameState.mode !== 'online' ||
      gameState.phase === 'GAME_OVER'
    ) {
      return;
    }

    const tick = () => {
      const deadline = turnDeadlineLocalRef.current;
      const latest = gameStateRef.current;
      const myProfile = profileRef.current;
      if (!deadline || !latest || !myProfile) return;

      const remainingMs = deadline - Date.now();
      setTurnSecondsLeft(Math.max(0, Math.ceil(remainingMs / 1000)));

      if (
        onlineRoleRef.current === 'host' &&
        remainingMs <= 0 &&
        latest.phase !== 'ROLLING' &&
        latest.autoBotPlayingSeat == null
      ) {
        turnDeadlineLocalRef.current = null;
        handleTurnTimeoutAuthoritative();
        return;
      }

      // If Guest timer is >2s overdue at 0s because old Host disconnected silently, take Host authority immediately
      if (
        onlineRoleRef.current === 'guest' &&
        remainingMs <= -2000 &&
        latest.phase !== 'ROLLING' &&
        latest.autoBotPlayingSeat == null &&
        peerManagerRef.current?.isPeerOpen()
      ) {
        const currentHostId = hostRoomIdRef.current || latest.hostId || '';
        const candidates = latest.seats
          .filter((s) => s.type === 'human' && !s.eliminated && s.id !== currentHostId)
          .sort((a, b) => a.seatIndex - b.seatIndex);
        if (candidates[0]?.id === myProfile.id) {
          onlineRoleRef.current = 'host';
          hostRoomIdRef.current = myProfile.id;
          setOnlineRole('host');
          setHostRoomId(myProfile.id);
          setLocalReconnecting(false);

          const promotedState: GameState = {
            ...latest,
            seats: latest.seats.map((s) =>
              s.id === currentHostId ? { ...s, connected: false } : s
            ),
            hostId: myProfile.id,
          };
          gameStateRef.current = promotedState;
          turnDeadlineLocalRef.current = null;
          handleTurnTimeoutAuthoritative();
        }
      }
    };

    const intervalId = window.setInterval(tick, 250);
    return () => window.clearInterval(intervalId);
  }, [view, gameState?.mode, gameState?.phase, handleTurnTimeoutAuthoritative]);

  // Background PeerJS PING/PONG heartbeat, automatic reconnection & fast Host failover
  useEffect(() => {
    if (
      view !== 'playing' ||
      !gameState ||
      gameState.mode !== 'online' ||
      gameState.phase === 'GAME_OVER'
    ) {
      setLocalReconnecting(false);
      return;
    }

    let disconnectedSince: number | null = null;

    const id = window.setInterval(() => {
      const pm = peerManagerRef.current;
      const latest = gameStateRef.current;
      const myProfile = profileRef.current;
      if (!pm || !latest || !myProfile || latest.phase === 'GAME_OVER') return;

      pm.ensureServerConnected();

      if (onlineRoleRef.current === 'guest') {
        const currentHostId = hostRoomIdRef.current;
        if (pm.hasOpenConnection(currentHostId)) {
          pm.sendTo(currentHostId, { type: 'PING' });
          const lastAct = pm.getLastActivityAt(currentHostId);
          // Detect silent WebRTC socket death (tab closed / Wi-Fi drop without FIN) within 6s
          if (lastAct > 0 && Date.now() - lastAct > 6000) {
            pm.closeConnection(currentHostId);
          } else {
            disconnectedSince = null;
            setLocalReconnecting(false);
            return;
          }
        }

        setLocalReconnecting(true);
        if (!disconnectedSince) {
          disconnectedSince = Date.now();
        }

        // After ~4s of Host remaining unreachable while online, migrate Host authority
        const elapsed = Date.now() - disconnectedSince;
        if (elapsed > 4000 && pm.isPeerOpen()) {
          const candidates = latest.seats
            .filter(
              (s) =>
                s.type === 'human' &&
                !s.eliminated &&
                s.id !== currentHostId
            )
            .sort((a, b) => a.seatIndex - b.seatIndex);

          const elected = candidates[0];
          if (elected && elected.id === myProfile.id) {
            // Promote self to Acting Host and place old Host in 3-Strike Auto-Bot grace
            onlineRoleRef.current = 'host';
            hostRoomIdRef.current = myProfile.id;
            setOnlineRole('host');
            setHostRoomId(myProfile.id);
            setLocalReconnecting(false);
            disconnectedSince = null;

            const preservedRemaining = turnDeadlineLocalRef.current
              ? Math.max(1500, turnDeadlineLocalRef.current - Date.now())
              : latest.turnRemainingMs;
            const migratedSeats = latest.seats.map((s) =>
              s.id === currentHostId ? { ...s, connected: false } : s
            );
            const migratedState: GameState = {
              ...latest,
              phase: latest.phase === 'ROLLING' ? 'WAIT_ROLL' : latest.phase,
              seats: migratedSeats,
              turnRemainingMs: preservedRemaining,
              hostId: myProfile.id,
              lastEvent: `Host migrated to ${myProfile.name} · Match continuing`,
              turnSequence: latest.turnSequence + 1,
            };
            commitAndBroadcastState(migratedState, 'none');
            return;
          } else if (elected && elected.id !== myProfile.id) {
            hostRoomIdRef.current = elected.id;
            setHostRoomId(elected.id);
            pm.connectToFriend(elected.id);
            return;
          }
        }

        if (pm.isPeerOpen()) {
          pm.connectToFriend(currentHostId);
        }
      } else {
        // Host: ping connected guests and detect silent peer drops within ~8s
        pm.broadcast({ type: 'PING' });
        const now = Date.now();
        let anySilentDrop = false;
        const updatedSeats = latest.seats.map((s) => {
          if (s.type !== 'human' || s.eliminated || s.id === myProfile.id || !s.connected) {
            return s;
          }
          const isOpen = pm.hasOpenConnection(s.id);
          const lastAct = pm.getLastActivityAt(s.id);
          if (!isOpen || (lastAct > 0 && now - lastAct > 8000)) {
            if (isOpen) pm.closeConnection(s.id);
            anySilentDrop = true;
            return { ...s, connected: false };
          }
          return s;
        });

        if (anySilentDrop) {
          const preservedRemaining = turnDeadlineLocalRef.current
            ? Math.max(1500, turnDeadlineLocalRef.current - Date.now())
            : latest.turnRemainingMs;
          commitAndBroadcastState(
            {
              ...latest,
              seats: updatedSeats,
              turnRemainingMs: preservedRemaining,
              lastEvent: `Player connection dropped · Reconnecting...`,
              turnSequence: latest.turnSequence + 1,
            },
            'none'
          );
        }

        // If ALL human guests disappeared (Host's own internet dropped & returned),
        // probe any candidate seat in case Host migrated while offline.
        const openIds = pm.getOpenConnectionIds();
        if (openIds.length === 0) {
          const anyOtherSeat = latest.seats.find(
            (s) => s.type === 'human' && !s.eliminated && s.id !== myProfile.id
          );
          if (anyOtherSeat && pm.isPeerOpen() && !disconnectedSince) {
            disconnectedSince = Date.now();
          } else if (disconnectedSince && Date.now() - disconnectedSince > 7000 && pm.isPeerOpen()) {
            const firstGuest = latest.seats
              .filter((s) => s.type === 'human' && !s.eliminated && s.id !== myProfile.id)
              .sort((a, b) => a.seatIndex - b.seatIndex)[0];
            if (firstGuest) {
              pm.connectToFriend(firstGuest.id);
            }
            disconnectedSince = Date.now();
          }
        } else {
          disconnectedSince = null;
        }
      }
    }, 2500);

    return () => window.clearInterval(id);
  }, [view, gameState?.mode, gameState?.phase, commitAndBroadcastState]);

  // Keep Full-Mesh Private Voice Chat synced during active online matches and stop cleanly when exiting
  useEffect(() => {
    const pm = peerManagerRef.current;
    const myId = profile?.id;
    if (
      view === 'playing' &&
      gameState?.mode === 'online' &&
      gameState.phase !== 'GAME_OVER' &&
      myId
    ) {
      const peerIds = gameState.seats
        .filter((s) => s.type === 'human' && !s.eliminated && s.id !== myId)
        .map((s) => s.id);
      pm?.syncVoiceMeshPeers(peerIds);
    } else {
      pm?.stopAllVoiceChat();
      setMicEnabled(false);
      setSpeakerEnabled(true);
      setVoiceError('');
    }
  }, [view, gameState?.mode, gameState?.phase, gameState?.seats, profile?.id]);

  const handleSaveProfile = (name: string) => {
    const saved = savePlayerProfile(name, profile?.id);
    setProfile(saved);
    setEditingName(false);

    if (onlineRole === 'host') {
      const updated = (lobbySeats.length === 4 ? lobbySeats : createInitialOnlineSeats(saved)).map(
        (s, idx) => (idx === 0 ? { ...s, id: saved.id, name: saved.name } : s)
      );
      setLobbySeats(updated);
      broadcastLobbySeats(updated);
    }
  };

  const handleToggleMute = () => {
    const next = !muted;
    setMuted(next);
    soundEngine.setMuted(next);
    saveMutedPreference(next);
    if (!next) {
      soundEngine.unlock();
      soundEngine.play('turn');
    }
  };

  // Gentle "Your Turn" alert ping when active turn transfers to the local player
  useEffect(() => {
    if (view !== 'playing' || inLobby || !gameState || !profile) {
      prevTurnAlertRef.current = null;
      return;
    }

    const prev = prevTurnAlertRef.current;
    const seat = gameState.seats[gameState.currentTurnSeat];
    const isLocalTurn =
      gameState.phase === 'WAIT_ROLL' &&
      Boolean(seat && seat.id === profile.id && !seat.eliminated);

    if (
      prev &&
      prev.seq !== gameState.turnSequence &&
      prev.seat !== gameState.currentTurnSeat &&
      isLocalTurn
    ) {
      const id = window.setTimeout(() => {
        soundEngine.play('turn');
      }, 160);
      prevTurnAlertRef.current = {
        seat: gameState.currentTurnSeat,
        seq: gameState.turnSequence,
      };
      return () => window.clearTimeout(id);
    }

    prevTurnAlertRef.current = {
      seat: gameState.currentTurnSeat,
      seq: gameState.turnSequence,
    };
  }, [view, inLobby, gameState, profile]);

  const handleRemoveFriend = (id: string) => {
    setFriends(removeFriend(id));
  };

  const handleJoinFriend = (friendId: string) => {
    const clean = friendId.replace(/\D/g, '').slice(0, 6);
    if (!isValidSixDigitId(clean)) {
      setPeerError('Please enter a valid 6-digit Friend ID.');
      return;
    }
    if (!profile || clean === profile.id) {
      setPeerError('Cannot join your own ID.');
      return;
    }
    setPeerError('');
    setPeerNotice('');
    setPendingInvite(null);
    inLobbyRef.current = false;
    setInLobby(false);
    setIsConnecting(true);
    setConnectingTargetId(clean);
    onlineRoleRef.current = 'guest';
    hostRoomIdRef.current = clean;
    setOnlineRole('guest');
    setHostRoomId(clean);
    peerManagerRef.current?.closeAllConnections();
    peerManagerRef.current?.connectToFriend(clean);
  };

  const handleInviteOrJoinFriend = (friend: FriendEntry) => {
    if (!profile) return;
    if (onlineRole === 'host' && connectedFriendsCount > 0) {
      // Already hosting a room with players: send an invite without dropping current room
      setPeerError('');
      peerManagerRef.current?.inviteFriend(friend.id, profile);
      setPeerNotice(`Invite sent to ${friend.nickname} (#${friend.id})`);
      scheduleTimer(() => setPeerNotice(''), 3000);
    } else {
      handleJoinFriend(friend.id);
    }
  };

  const handleLeaveOnlineRoom = () => {
    if (!profile) return;
    peerManagerRef.current?.closeAllConnections();
    const resetSeats = createInitialOnlineSeats(profile);
    onlineRoleRef.current = 'host';
    hostRoomIdRef.current = profile.id;
    lobbySeatsRef.current = resetSeats;
    setOnlineRole('host');
    setHostRoomId(profile.id);
    setLobbySeats(resetSeats);
    setIsConnecting(false);
    setConnectingTargetId(null);
    setPeerError('');
  };

  const handleRejoinActiveMatch = () => {
    clearAllTimers();
    const session = activeSession || loadActiveOnlineSession(profile?.id);
    if (!session || !profile) {
      clearActiveOnlineSession();
      setActiveSession(null);
      inLobbyRef.current = false;
      setInLobby(false);
      return;
    }

    const targets = [session.hostId, ...(session.candidateHostIds || [])].filter(
      (id, idx, arr) => Boolean(id) && id !== profile.id && arr.indexOf(id) === idx
    );

    if (targets.length === 0) {
      clearActiveOnlineSession();
      setActiveSession(null);
      inLobbyRef.current = false;
      setInLobby(false);
      setPeerError('No active opponents found to reconnect with.');
      return;
    }

    inLobbyRef.current = false;
    setInLobby(false);
    setIsRollingAnim(false);
    rejoinTargetsRef.current = targets;
    rejoinIndexRef.current = 0;
    isRejoiningRef.current = true;
    setIsRejoining(true);
    setPeerError('');
    setPeerNotice('Reconnecting to your active match...');

    if (peerManagerRef.current?.isPeerOpen()) {
      pendingAutoRejoinRef.current = false;
      attemptRejoinTarget(0);
    } else {
      pendingAutoRejoinRef.current = true;
      peerManagerRef.current?.ensureServerConnected();
    }
  };

  const handleLeaveSavedMatch = () => {
    clearAllTimers();
    stopRejoinAttempt();
    inLobbyRef.current = false;
    setInLobby(false);
    clearActiveOnlineSession();
    setActiveSession(null);
    handleLeaveOnlineRoom();
    setPeerNotice('');
  };

  const handleToggleMic = async () => {
    if (!gameState || gameState.mode !== 'online' || !profile) return;
    setVoiceError('');
    if (micEnabled) {
      peerManagerRef.current?.stopVoiceMic();
      setMicEnabled(false);
    } else {
      const peerIds = gameState.seats
        .filter((s) => s.type === 'human' && !s.eliminated && s.id !== profile.id)
        .map((s) => s.id);
      const started = await peerManagerRef.current?.startVoiceMic(peerIds);
      if (started) {
        setMicEnabled(true);
      }
    }
  };

  const handleToggleSpeaker = () => {
    const next = !speakerEnabled;
    setSpeakerEnabled(next);
    peerManagerRef.current?.setVoiceSpeakerEnabled(next);
  };

  const handleStartBotGame = () => {
    if (!profile) return;
    clearAllTimers();
    stopRejoinAttempt();
    inLobbyRef.current = false;
    setInLobby(false);
    setIsRollingAnim(false);
    hasShownInterstitialRef.current = false;
    const seats = createBotMatchSeats(profile.name, profile.id, botCount);
    const initial = createInitialGameState('bot', seats);
    setGameState(initial);
    gameStateRef.current = initial;
    setView('playing');
    soundEngine.play('open');
  };

  const handleStartOnlineGame = () => {
    if (onlineRole !== 'host' || !profile) return;
    const activeCount = lobbySeats.filter((s) => s.type !== 'empty').length;
    if (activeCount < 2) {
      setPeerError('Wait for at least 1 friend to join before starting.');
      return;
    }
    clearAllTimers();
    stopRejoinAttempt();
    inLobbyRef.current = false;
    setInLobby(false);
    setIsRollingAnim(false);
    hasShownInterstitialRef.current = false;
    setLocalReconnecting(false);
    const initial = createInitialGameState('online', lobbySeats, profile.id);
    setGameState(initial);
    gameStateRef.current = initial;
    syncActiveSessionForGameState(initial);
    setView('playing');
    soundEngine.play('open');
    peerManagerRef.current?.broadcast({ type: 'GAME_START', state: initial });
  };

  const handleRollClick = () => {
    if (!gameState || !profile || gameState.phase !== 'WAIT_ROLL') return;
    const activeSeat = gameState.seats[gameState.currentTurnSeat];
    if (!activeSeat || activeSeat.id !== profile.id || activeSeat.eliminated) return;

    if (gameState.mode === 'bot' || onlineRoleRef.current === 'host') {
      const cleared = clearSeatStrikes(gameState, gameState.currentTurnSeat);
      if (cleared !== gameState) {
        gameStateRef.current = cleared;
      }
      executeRollAuthoritative();
    } else {
      const targetHost = hostRoomIdRef.current || gameState.hostId || '';
      if (!targetHost) return;
      if (!peerManagerRef.current?.hasOpenConnection(targetHost)) {
        setLocalReconnecting(true);
        peerManagerRef.current?.connectToFriend(targetHost);
        return;
      }
      peerManagerRef.current.sendTo(targetHost, {
        type: 'ACTION_ROLL',
        playerId: profile.id,
      });
    }
  };

  const handleTokenClick = (tokenIndex: number) => {
    if (!gameState || !profile || gameState.phase !== 'WAIT_MOVE') return;
    const activeSeat = gameState.seats[gameState.currentTurnSeat];
    if (!activeSeat || activeSeat.id !== profile.id || activeSeat.eliminated) return;

    if (gameState.mode === 'bot' || onlineRoleRef.current === 'host') {
      const cleared = clearSeatStrikes(gameState, gameState.currentTurnSeat);
      if (cleared !== gameState) {
        gameStateRef.current = cleared;
      }
      executeMoveAuthoritative(tokenIndex);
    } else {
      const targetHost = hostRoomIdRef.current || gameState.hostId || '';
      if (!targetHost) return;
      if (!peerManagerRef.current?.hasOpenConnection(targetHost)) {
        setLocalReconnecting(true);
        peerManagerRef.current?.connectToFriend(targetHost);
        return;
      }
      peerManagerRef.current.sendTo(targetHost, {
        type: 'ACTION_MOVE',
        playerId: profile.id,
        tokenIndex,
      });
    }
  };

  const handlePlayAgain = () => {
    if (!gameState) return;
    clearAllTimers();
    setIsRollingAnim(false);
    hasShownInterstitialRef.current = false;
    setLocalReconnecting(false);
    const fresh = createInitialGameState(
      gameState.mode,
      gameState.seats,
      gameState.mode === 'online' ? profile?.id : undefined
    );
    commitAndBroadcastState(fresh, 'open');
  };

  const handleBackToLobby = () => {
    clearAllTimers();
    setIsRollingAnim(false);
    setConfirmLeaveOpen(false);
    peerManagerRef.current?.stopAllVoiceChat();
    setMicEnabled(false);
    setSpeakerEnabled(true);
    setVoiceError('');
    if (gameState && !hasShownInterstitialRef.current) {
      hasShownInterstitialRef.current = true;
      showInterstitialAd();
    }
    if (gameState?.mode === 'online') {
      if (gameState.phase === 'GAME_OVER') {
        inLobbyRef.current = false;
        setInLobby(false);
        clearActiveOnlineSession();
        setActiveSession(null);
        if (onlineRole === 'host') {
          peerManagerRef.current?.broadcast({ type: 'MATCH_ENDED_BACK_TO_LOBBY' });
          broadcastLobbySeats(lobbySeatsRef.current);
        } else {
          handleLeaveOnlineRoom();
        }
      } else if (onlineRole === 'host' && profile) {
        // Host exited to lobby mid-match: mark inLobby = true, notify peers, hand Host over, and preserve session for Rejoin!
        inLobbyRef.current = true;
        setInLobby(true);
        const nextHost = gameState.seats.find(
          (s) =>
            s.type === 'human' &&
            !s.eliminated &&
            s.id !== profile.id &&
            peerManagerRef.current?.hasOpenConnection(s.id)
        );
        if (nextHost) {
          const preservedRemaining = turnDeadlineLocalRef.current
            ? Math.max(2000, turnDeadlineLocalRef.current - Date.now())
            : TURN_DURATION_MS;
          const transferredState: GameState = {
            ...gameState,
            phase: gameState.phase === 'ROLLING' ? 'WAIT_ROLL' : gameState.phase,
            turnRemainingMs: preservedRemaining,
            hostId: nextHost.id,
            seats: gameState.seats.map((s) =>
              s.id === profile.id ? { ...s, connected: false } : s
            ),
            lastEvent: `${profile.name} went to lobby · Host passed to ${nextHost.name}`,
            turnSequence: gameState.turnSequence + 1,
          };
          peerManagerRef.current?.broadcast({ type: 'PLAYER_AWAY', playerId: profile.id });
          peerManagerRef.current?.broadcast({
            type: 'HOST_TRANSFER',
            newHostId: nextHost.id,
            state: transferredState,
          });
          syncActiveSessionForGameState(transferredState);
          scheduleTimer(() => {
            handleLeaveOnlineRoom();
          }, 120);
        } else {
          peerManagerRef.current?.broadcast({ type: 'PLAYER_AWAY', playerId: profile.id });
          syncActiveSessionForGameState(gameState);
          scheduleTimer(() => {
            handleLeaveOnlineRoom();
          }, 80);
        }
      } else if (profile) {
        // Guest exited to lobby mid-match: mark inLobby = true, notify Host of away status, and preserve ActiveOnlineSession
        inLobbyRef.current = true;
        setInLobby(true);
        peerManagerRef.current?.broadcast({ type: 'PLAYER_AWAY', playerId: profile.id });
        syncActiveSessionForGameState(gameState);
        scheduleTimer(() => {
          handleLeaveOnlineRoom();
        }, 80);
      }
    }
    setGameState(null);
    setView('lobby');
  };

  handleBackToLobbyRef.current = handleBackToLobby;

  const handleResetAllLocalData = () => {
    clearAllTimers();
    stopRejoinAttempt();
    peerManagerRef.current?.stopAllVoiceChat();
    peerManagerRef.current?.closeAllConnections();
    peerManagerRef.current?.destroy();
    peerManagerRef.current = null;
    clearAllLocalData();

    soundEngine.setMuted(false);
    setMuted(false);
    setFriends([]);
    setActiveSession(null);
    inLobbyRef.current = false;
    setInLobby(false);
    setMicEnabled(false);
    setSpeakerEnabled(true);
    setVoiceError('');
    setIsRollingAnim(false);
    setConfirmLeaveOpen(false);
    setPrivacyOpen(false);
    setEditingName(false);
    setPendingInvite(null);
    setPeerReady(false);
    setPeerError('');
    setPeerNotice('');
    setIsConnecting(false);
    setConnectingTargetId(null);
    setJoinIdInput('');
    onlineRoleRef.current = 'host';
    hostRoomIdRef.current = '';
    lobbySeatsRef.current = [];
    setOnlineRole('host');
    setHostRoomId('');
    setLobbySeats([]);
    gameStateRef.current = null;
    setGameState(null);
    setView('lobby');
    setProfile(null);
  };

  const handleCopyRoomId = async () => {
    if (!profile) return;
    try {
      await navigator.clipboard.writeText(profile.id);
      setCopiedRoomId(true);
      setTimeout(() => setCopiedRoomId(false), 1800);
    } catch {
      // ignore
    }
  };

  const localHumanSeats =
    gameState && profile
      ? gameState.seats
          .filter((s) => s.type === 'human' && s.id === profile.id)
          .map((s) => s.seatIndex)
      : [];

  const activeSeat = gameState ? gameState.seats[gameState.currentTurnSeat] : null;
  const isMyTurn = Boolean(activeSeat && localHumanSeats.includes(activeSeat.seatIndex));

  // Safety check: while player is actively viewing the board on their turn, clear any stale Auto-Bot/disconnect lock
  useEffect(() => {
    if (
      view !== 'playing' ||
      inLobby ||
      !gameState ||
      gameState.mode !== 'online' ||
      !profile ||
      !activeSeat ||
      !isMyTurn ||
      activeSeat.eliminated
    ) {
      return;
    }

    const hasStaleLock =
      Boolean(activeSeat.autoBotActive) ||
      !activeSeat.connected ||
      (activeSeat.strikes ?? 0) > 0 ||
      gameState.autoBotPlayingSeat === activeSeat.seatIndex;

    if (hasStaleLock) {
      if (onlineRoleRef.current === 'host') {
        const cleared = clearSeatStrikes(gameState, activeSeat.seatIndex, profile.name);
        commitAndBroadcastState(
          {
            ...cleared,
            autoBotPlayingSeat:
              cleared.autoBotPlayingSeat === activeSeat.seatIndex
                ? null
                : cleared.autoBotPlayingSeat,
            turnSequence: cleared.turnSequence + 1,
          },
          'none'
        );
      } else {
        const clearedLocal = clearSeatStrikes(gameState, activeSeat.seatIndex, profile.name);
        setGameState({
          ...clearedLocal,
          autoBotPlayingSeat: null,
        });
        const targetHost = hostRoomIdRef.current || gameState.hostId || '';
        if (targetHost && peerManagerRef.current?.hasOpenConnection(targetHost)) {
          peerManagerRef.current.sendTo(targetHost, {
            type: 'PLAYER_REJOINED',
            profile,
          });
        }
      }
    }
  }, [
    view,
    inLobby,
    gameState,
    profile,
    activeSeat,
    isMyTurn,
    commitAndBroadcastState,
  ]);

  // Dice is NEVER disabled by leftover Auto-Bot flags when the player is actively on the board and it is their turn
  const canRoll = Boolean(
    gameState &&
      activeSeat &&
      !activeSeat.eliminated &&
      isMyTurn &&
      gameState.phase === 'WAIT_ROLL' &&
      !isRollingAnim
  );

  const activeLobbyCount = lobbySeats.filter((s) => s.type !== 'empty').length;
  const connectedFriendsCount = lobbySeats.filter(
    (s) => s.type === 'human' && s.id !== profile?.id
  ).length;
  const roomHostSeat = lobbySeats.find((s) => s.id === hostRoomId) || lobbySeats[0];
  const roomHostName = roomHostSeat?.name || 'Host';

  return (
    <div className="min-h-[100dvh] royal-game-bg text-white flex flex-col">
      {/* First-Launch Onboarding / Edit Name Modal */}
      {(!profile || editingName) && (
        <WelcomeModal
          initialName={profile?.name || ''}
          existingId={profile?.id}
          isEditMode={Boolean(profile && editingName)}
          onSave={handleSaveProfile}
          onCancel={profile ? () => setEditingName(false) : undefined}
        />
      )}

      {/* Privacy & Data Controls Modal */}
      {privacyOpen && (
        <PrivacyModal
          onClose={() => setPrivacyOpen(false)}
          onResetData={handleResetAllLocalData}
        />
      )}

      {/* Leave Match In-App Confirmation Modal */}
      {confirmLeaveOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#07051F]/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl bg-gradient-to-b from-[#25216B] to-[#17144A] border border-indigo-300/30 shadow-2xl p-5 space-y-4 text-white">
            <h3 className="text-lg font-extrabold text-white">Leave Match and return to Lobby?</h3>
            <p className="text-sm text-indigo-200/90">
              {gameState?.mode === 'online' && gameState.phase !== 'GAME_OVER'
                ? 'Your online match keeps running with Auto-Bot grace. You can tap Rejoin Active Match from the lobby before 3 missed turns.'
                : 'Your current board progress will be cleared and you will return to the lobby.'}
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setConfirmLeaveOpen(false)}
                className="flex-1 h-11 rounded-xl border border-indigo-300/30 bg-[#1B1754] text-indigo-100 text-sm font-bold hover:bg-[#231E69] cursor-pointer"
              >
                Keep Playing
              </button>
              <button
                type="button"
                onClick={handleBackToLobby}
                className="flex-1 h-11 rounded-xl bg-gradient-to-b from-rose-500 to-rose-700 border-b-4 border-rose-900 text-white text-sm font-extrabold hover:brightness-105 cursor-pointer"
              >
                Leave Match
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Compact Top App Bar */}
      <header className="sticky top-0 z-30 h-[52px] bg-[#110D38]/90 backdrop-blur-md border-b border-indigo-400/20 px-4">
        <div className="max-w-5xl mx-auto h-full flex items-center justify-between gap-4">
          {view === 'playing' ? (
            <button
              type="button"
              onClick={() =>
                gameState?.phase === 'GAME_OVER'
                  ? handleBackToLobby()
                  : setConfirmLeaveOpen(true)
              }
              className="h-10 px-3 -ml-2 rounded-xl text-indigo-100 hover:bg-white/10 text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Lobby</span>
            </button>
          ) : (
            <span className="font-display text-base font-black tracking-tight text-amber-300 whitespace-nowrap shrink-0">
              LUDO YAARI
            </span>
          )}

          {view === 'playing' && gameState ? (
            <div className="text-xs font-semibold text-indigo-200 truncate">
              {gameState.mode === 'bot'
                ? 'Offline · vs Computer'
                : `Online · Room #${hostRoomId}`}
            </div>
          ) : (
            profile && (
              <div className="flex items-center gap-1 min-w-0">
                <button
                  type="button"
                  onClick={() => setEditingName(true)}
                  className="h-9 px-2 rounded-xl hover:bg-white/10 flex items-center gap-1.5 text-xs text-indigo-100 min-w-0 cursor-pointer"
                  title="Edit Player Name"
                >
                  <span className="font-bold truncate max-w-[100px] sm:max-w-[180px] text-white">
                    {profile.name}
                  </span>
                  <Pencil className="w-3 h-3 text-indigo-300 shrink-0" />
                </button>
                <span className="text-indigo-400 text-xs select-none">·</span>
                <button
                  type="button"
                  onClick={handleCopyRoomId}
                  aria-label="Copy 6-digit Player ID"
                  title={copiedRoomId ? 'Copied!' : 'Tap to copy your 6-digit ID'}
                  className="h-9 px-2 rounded-xl hover:bg-white/10 flex items-center gap-1.5 text-xs font-mono-id font-bold text-amber-300 shrink-0 cursor-pointer transition-colors"
                >
                  <span>#{profile.id}</span>
                  {copiedRoomId ? (
                    <Check className="w-3.5 h-3.5 text-emerald-300" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-amber-200/90" />
                  )}
                </button>
              </div>
            )
          )}

          <div className="flex items-center gap-2 shrink-0">
            {view === 'lobby' && (
              <button
                type="button"
                onClick={() => setPrivacyOpen(true)}
                aria-label="Privacy & Info"
                title="Privacy & Info"
                className="w-10 h-10 rounded-xl border border-indigo-300/25 bg-[#1B1754] text-indigo-100 hover:bg-[#26206E] flex items-center justify-center shrink-0 cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4 text-sky-300" />
              </button>
            )}
            <button
              type="button"
              onClick={handleToggleMute}
              aria-label={muted ? 'Unmute sound effects' : 'Mute sound effects'}
              className="w-10 h-10 rounded-xl border border-indigo-300/25 bg-[#1B1754] text-indigo-100 hover:bg-[#26206E] flex items-center justify-center shrink-0 cursor-pointer"
            >
              {muted ? <VolumeX className="w-4 h-4 text-indigo-300/60" /> : <Volume2 className="w-4 h-4 text-amber-300" />}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area (Single Clean Screen, leaves 60px at bottom for AdMob Banner) */}
      <main className="flex-1 w-full pb-[68px] flex flex-col">
        {view === 'lobby' && profile && (
          <div className="max-w-5xl mx-auto px-4 py-4 sm:py-6">
            {/* Glossy 3D Game Title Banner */}
            <div className="flex flex-col items-center text-center mb-5 sm:mb-7 select-none">
              <div className="inline-flex items-center gap-3 px-6 py-2.5 rounded-2xl bg-gradient-to-b from-[#332A85] via-[#221B66] to-[#17124C] border-2 border-amber-300/50 shadow-[0_12px_32px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.28)]">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-b from-amber-300 via-amber-400 to-orange-500 text-stone-950 flex items-center justify-center shadow-md border border-amber-100 shrink-0">
                  <Crown className="w-5 h-5 fill-amber-900/20" />
                </div>
                <h1
                  className="font-display text-2xl sm:text-4xl font-black tracking-wide bg-gradient-to-b from-yellow-200 via-amber-400 to-orange-500 bg-clip-text text-transparent"
                  style={{
                    filter: 'drop-shadow(0 3px 0 rgba(66,24,4,0.85)) drop-shadow(0 6px 12px rgba(0,0,0,0.45))',
                  }}
                >
                  LUDO YAARI
                </h1>
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-b from-sky-300 via-blue-500 to-indigo-700 text-white flex items-center justify-center shadow-md border border-sky-200/70 shrink-0">
                  <Dices className="w-5 h-5" />
                </div>
              </div>
            </div>

            {/* Prominent Rejoin Active Match Banner (shows after exiting or reloading mid-match) */}
            {activeSession && (
              <div className="mb-5 rounded-2xl bg-gradient-to-r from-emerald-950/95 via-emerald-900/90 to-teal-950/95 border-2 border-emerald-400/75 shadow-[0_0_28px_rgba(16,185,129,0.32),inset_0_1px_0_rgba(255,255,255,0.22)] p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start sm:items-center gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-b from-emerald-300 via-emerald-400 to-emerald-600 text-stone-950 flex items-center justify-center shrink-0 shadow-md border border-emerald-100 animate-pulse">
                    <PlugZap className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="font-display text-base sm:text-lg font-black text-emerald-100 leading-tight">
                        Active Online Match Found
                      </h2>
                      <span className="px-2 py-0.5 rounded-md bg-emerald-400/20 border border-emerald-300/40 text-[10px] font-bold font-mono-id text-emerald-200">
                        Room #{activeSession.hostId}
                      </span>
                    </div>
                    <p className="text-xs text-emerald-200/85 mt-0.5">
                      Host: <span className="font-bold text-white">{activeSession.hostName}</span> · Reconnect before 3 missed turns to restore full control.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                  <button
                    type="button"
                    onClick={handleRejoinActiveMatch}
                    disabled={isRejoining}
                    className="flex-1 sm:flex-initial h-11 px-5 rounded-xl bg-gradient-to-b from-emerald-400 via-emerald-500 to-green-600 border-b-4 border-green-900 text-stone-950 font-extrabold text-sm shadow-[0_6px_22px_rgba(16,185,129,0.5)] hover:brightness-105 active:translate-y-0.5 disabled:opacity-70 flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer transition-all"
                  >
                    {isRejoining ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Rejoining...</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 fill-current" />
                        <span>Rejoin Active Match</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={handleLeaveSavedMatch}
                    className="h-11 px-3.5 rounded-xl border border-rose-400/45 bg-rose-950/65 hover:bg-rose-900/75 text-rose-100 text-xs font-bold whitespace-nowrap cursor-pointer transition-colors"
                  >
                    Leave Match
                  </button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              {/* Mode 1: Play vs Computer */}
              <section className="lg:col-span-5 rounded-2xl bg-gradient-to-b from-[#262B7E]/95 to-[#171A54]/95 border border-sky-300/30 shadow-[0_16px_38px_rgba(0,0,0,0.48),inset_0_1px_0_rgba(255,255,255,0.22)] p-4 sm:p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-b from-amber-300 via-amber-400 to-orange-500 border border-amber-100 text-stone-950 flex items-center justify-center shrink-0 shadow-md">
                    <Bot className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="font-display text-lg font-extrabold text-white leading-tight">
                      Play with Computer
                    </h2>
                    <p className="text-xs text-sky-100/80">
                      Instant offline match against smart Computer opponents
                    </p>
                  </div>
                </div>

                <div>
                  <span className="block text-xs font-semibold text-sky-100/85 mb-2">
                    Number of Computer Opponents
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    {([1, 2, 3] as const).map((count) => (
                      <button
                        key={count}
                        type="button"
                        onClick={() => setBotCount(count)}
                        className={`h-11 rounded-xl border text-xs sm:text-sm font-extrabold transition-all cursor-pointer ${
                          botCount === count
                            ? 'bg-gradient-to-b from-sky-300 via-sky-400 to-blue-600 text-white border-sky-200 shadow-md'
                            : 'bg-[#121445] text-indigo-100 border-indigo-300/25 hover:bg-[#1B1F63]'
                        }`}
                      >
                        {count === 1 ? '1 Computer' : `${count} Computers`}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleStartBotGame}
                  className="w-full h-12 rounded-xl bg-gradient-to-b from-amber-300 via-amber-400 to-orange-500 border-b-4 border-amber-700 text-stone-950 text-sm font-black tracking-wide flex items-center justify-center gap-2 hover:brightness-105 active:scale-[0.98] transition-all cursor-pointer shadow-lg"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Start Offline Match</span>
                </button>
              </section>

              {/* Mode 2: Online Friends (Peer-to-Peer) + Integrated Recent / Saved Friends History */}
              <section className="lg:col-span-7 rounded-2xl bg-gradient-to-b from-[#2B2372]/95 to-[#18134D]/95 border border-indigo-300/30 shadow-[0_16px_38px_rgba(0,0,0,0.48),inset_0_1px_0_rgba(255,255,255,0.22)] p-4 sm:p-5 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-b from-emerald-300 via-emerald-400 to-emerald-600 border border-emerald-100 text-stone-950 flex items-center justify-center shrink-0 shadow-md">
                      <Wifi className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="font-display text-lg font-extrabold text-white leading-tight">
                        Online Friends (Peer-to-Peer)
                      </h2>
                      <p className="text-xs text-indigo-100/80">
                        {peerReady
                          ? onlineRole === 'host'
                            ? 'Room open · Ready for friends to join'
                            : `Joined Room #${hostRoomId}`
                          : 'Connecting to PeerJS network...'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {isConnecting ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-300">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Connecting...</span>
                      </span>
                    ) : onlineRole === 'guest' || connectedFriendsCount > 0 ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-300">
                        <Check className="w-3.5 h-3.5" />
                        <span>Connected</span>
                      </span>
                    ) : !peerReady ? (
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-200">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Connecting...</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => initPeer(profile)}
                          className="h-9 px-3 rounded-lg border border-indigo-300/30 bg-[#1B1754] text-xs font-semibold text-indigo-100 flex items-center gap-1 hover:bg-[#26206E] cursor-pointer"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Retry</span>
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs font-bold text-emerald-300">Ready</span>
                    )}
                  </div>
                </div>

                {peerError && (
                  <div className="px-3.5 py-2.5 rounded-xl bg-rose-950/70 border border-rose-400/40 text-xs font-semibold text-rose-200">
                    {peerError}
                  </div>
                )}

                {isConnecting && connectingTargetId && (
                  <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-amber-950/60 border border-amber-400/40">
                    <div className="flex items-center gap-2 text-xs font-semibold text-amber-200">
                      <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                      <span>
                        Connecting to friend <span className="font-mono-id">#{connectingTargetId}</span>...
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleLeaveOnlineRoom}
                      className="h-8 px-2.5 rounded-lg border border-amber-300/40 bg-[#1E1959] text-xs font-semibold text-amber-100 hover:bg-[#292373] cursor-pointer shrink-0"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {!isConnecting && onlineRole === 'guest' && (
                  <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-emerald-950/60 border border-emerald-400/40 text-xs font-semibold text-emerald-200">
                    <Check className="w-4 h-4 shrink-0" />
                    <span>
                      Joined {roomHostName}&apos;s Room (<span className="font-mono-id">#{hostRoomId}</span>)
                    </span>
                  </div>
                )}

                {peerNotice && (
                  <div className="px-3.5 py-2.5 rounded-xl bg-emerald-950/60 border border-emerald-400/40 text-xs font-semibold text-emerald-200">
                    {peerNotice}
                  </div>
                )}

                {pendingInvite && (
                  <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-amber-950/60 border border-amber-400/40">
                    <div className="min-w-0 text-xs text-amber-100">
                      <span className="font-bold">{pendingInvite.name}</span>{' '}
                      <span className="font-mono-id">(#{pendingInvite.id})</span> invited you to play
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleJoinFriend(pendingInvite.id)}
                        className="h-8 px-3 rounded-lg bg-emerald-500 text-white text-xs font-bold hover:bg-emerald-600 cursor-pointer"
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingInvite(null)}
                        className="h-8 px-2.5 rounded-lg border border-amber-300/40 bg-[#1B1754] text-xs font-semibold text-amber-100 hover:bg-[#26206E] cursor-pointer"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                )}

                {/* Enter friend's 6-digit ID to join */}
                {onlineRole === 'host' && connectedFriendsCount === 0 && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleJoinFriend(joinIdInput);
                    }}
                    className="flex items-center gap-2"
                  >
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={joinIdInput}
                      onChange={(e) =>
                        setJoinIdInput(e.target.value.replace(/\D/g, '').slice(0, 6))
                      }
                      placeholder="Enter friend's 6-digit ID to join"
                      className="flex-1 h-11 px-3.5 rounded-xl border border-indigo-300/30 bg-[#110E3B] font-mono-id text-sm text-white placeholder:font-sans placeholder:text-indigo-200/50 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400"
                    />
                    <button
                      type="submit"
                      disabled={!peerReady || isConnecting || joinIdInput.length !== 6}
                      className="h-11 px-4 rounded-xl bg-gradient-to-b from-emerald-400 via-emerald-500 to-emerald-600 border-b-4 border-emerald-800 text-white text-sm font-extrabold flex items-center gap-1.5 hover:brightness-105 disabled:opacity-45 disabled:cursor-not-allowed active:scale-[0.98] transition-all shrink-0 cursor-pointer shadow-md"
                    >
                      {isConnecting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <PlugZap className="w-4 h-4" />
                      )}
                      <span>{isConnecting ? 'Connecting...' : 'Join'}</span>
                    </button>
                  </form>
                )}

                {/* Direct Recent / Saved Friends History */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-indigo-200/80">
                    <span className="flex items-center gap-1.5">
                      <History className="w-3.5 h-3.5 text-amber-300" />
                      <span>Recent / Saved Friends History</span>
                    </span>
                    <span className="tabular-nums">{friends.length} saved</span>
                  </div>

                  {friends.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-indigo-300/25 bg-[#120F3F]/70 px-3.5 py-3 text-xs text-indigo-200/75">
                      Friends you connect with are automatically saved here with their Name and 6-digit ID for one-tap reconnect.
                    </div>
                  ) : (
                    <ul className="divide-y divide-indigo-400/15 border border-indigo-300/25 rounded-xl overflow-hidden bg-[#120F3F]/90 max-h-[190px] overflow-y-auto">
                      {friends.map((friend) => {
                        const alreadyInRoom = lobbySeats.some(
                          (s) => s.type === 'human' && s.id === friend.id
                        );
                        return (
                          <li
                            key={friend.id}
                            className="flex items-center justify-between gap-2 px-3 py-2.5 hover:bg-white/5 transition-colors"
                          >
                            <div className="min-w-0">
                              <div className="text-sm font-bold text-white truncate">
                                {friend.nickname}
                              </div>
                              <div className="font-mono-id text-[11px] text-amber-300/90">
                                ID: {friend.id}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                disabled={
                                  !peerReady ||
                                  isConnecting ||
                                  alreadyInRoom ||
                                  onlineRole === 'guest'
                                }
                                onClick={() => handleInviteOrJoinFriend(friend)}
                                className="h-9 px-3 rounded-lg bg-gradient-to-b from-emerald-400 to-emerald-600 border-b-2 border-emerald-800 text-white text-xs font-bold flex items-center gap-1.5 hover:brightness-105 disabled:opacity-45 disabled:cursor-not-allowed active:scale-[0.97] transition-all cursor-pointer"
                              >
                                <PlugZap className="w-3.5 h-3.5" />
                                <span>
                                  {alreadyInRoom
                                    ? 'In Room'
                                    : onlineRole === 'host' && connectedFriendsCount > 0
                                    ? 'Invite'
                                    : 'Join / Invite'}
                                </span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveFriend(friend.id)}
                                aria-label={`Remove ${friend.nickname}`}
                                className="w-9 h-9 rounded-lg border border-indigo-300/25 bg-[#1B1754] text-indigo-200/70 hover:text-rose-300 hover:border-rose-400/40 hover:bg-rose-950/60 flex items-center justify-center transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                {/* 4-Seat Multiplayer Roster (Live PUBG-Style Lobby Sync) */}
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between text-xs font-semibold text-indigo-200/80">
                    <span>Room Seats ({activeLobbyCount}/4 Active)</span>
                    <span className="text-[11px] font-bold text-amber-300">
                      {onlineRole === 'host'
                        ? 'You are Room Host'
                        : isConnecting
                        ? `Joining #${hostRoomId}...`
                        : `Host: ${roomHostName}`}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {DISPLAY_SEAT_ORDER.map((seatIdx, playerSlotIndex) => {
                      const seat = lobbySeats[seatIdx];
                      if (!seat) return null;
                      const theme = COLOR_THEMES[seat.color];
                      const isEmpty = seat.type === 'empty';
                      const isMe = seat.id === profile.id;
                      const isRoomHostSeat = !isEmpty && seat.id === hostRoomId;
                      const playerNumber = playerSlotIndex + 1;

                      return (
                        <div
                          key={seat.seatIndex}
                          className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border ${
                            !isEmpty
                              ? 'border-emerald-400/35 bg-[#15124B]/95'
                              : 'border-indigo-300/20 bg-[#120F3F]/75'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span
                              className="w-3 h-3 rounded-full shrink-0 ring-2 ring-white/40"
                              style={{ backgroundColor: theme.primary }}
                            />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="text-xs font-bold text-white truncate">
                                  {isEmpty
                                    ? `Player ${playerNumber} Waiting...`
                                    : isMe
                                    ? `Player ${playerNumber} (You)`
                                    : seat.name}
                                </span>
                                {isRoomHostSeat && (
                                  <span className="px-1.5 py-0.5 rounded bg-amber-400/20 border border-amber-300/40 text-[9px] font-extrabold text-amber-300 uppercase tracking-wide shrink-0">
                                    Host
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-indigo-200/75 truncate">
                                {isEmpty
                                  ? `${theme.name} seat`
                                  : isMe
                                  ? `${seat.name} · ${theme.name} seat`
                                  : `ID: ${seat.id} · ${theme.name}`}
                              </div>
                            </div>
                          </div>

                          {!isEmpty && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-[10px] font-bold text-emerald-300 shrink-0">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                              <span>Connected / Ready</span>
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {onlineRole === 'host' ? (
                  <button
                    type="button"
                    onClick={handleStartOnlineGame}
                    disabled={activeLobbyCount < 2}
                    className="w-full h-12 rounded-xl bg-gradient-to-b from-emerald-400 via-emerald-500 to-emerald-600 border-b-4 border-emerald-800 text-white text-sm font-black tracking-wide flex items-center justify-center gap-2 hover:brightness-105 disabled:from-indigo-950 disabled:via-indigo-950 disabled:to-indigo-950 disabled:border-indigo-900 disabled:text-indigo-300/50 disabled:cursor-not-allowed active:scale-[0.98] transition-all cursor-pointer shadow-lg"
                  >
                    <Users className="w-4 h-4" />
                    <span>
                      {activeLobbyCount < 2
                        ? 'Waiting for at least 1 friend to join'
                        : `Start Online Match (${activeLobbyCount} Players)`}
                    </span>
                  </button>
                ) : (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-3.5 py-3 rounded-xl bg-[#120F3F]/90 border border-emerald-400/30">
                    <div className="flex items-center gap-2 text-xs font-bold text-emerald-300 min-w-0">
                      <Loader2 className="w-4 h-4 animate-spin shrink-0 text-amber-300" />
                      <span>
                        {isConnecting
                          ? `Connecting to Host (#${hostRoomId})...`
                          : `Waiting for Host (${roomHostName}) to start the match...`}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleLeaveOnlineRoom}
                      className="h-9 px-3.5 rounded-xl border border-indigo-300/30 bg-[#1B1754] text-xs font-bold text-indigo-100 hover:bg-[#26206E] cursor-pointer shrink-0 self-end sm:self-auto"
                    >
                      Leave Room
                    </button>
                  </div>
                )}
              </section>
            </div>
          </div>
        )}

        {/* Active Gameplay Layout */}
        {view === 'playing' && gameState && activeSeat && (
          <div className="flex-1 w-full max-w-5xl mx-auto px-1.5 sm:px-4 py-2 sm:py-4 flex flex-col justify-center lg:grid lg:grid-cols-12 lg:gap-6 lg:items-center">
            {/* Ludo Board + Private Online Voice Chat + Centered 3D Dice & Player Name directly below */}
            <div className="lg:col-span-8 w-full flex flex-col items-center justify-center pt-1 sm:pt-2">
              {/* Secret Private Voice Chat Controls (Online Match ONLY — never shown in Bot mode or Lobby) */}
              {gameState.mode === 'online' && gameState.phase !== 'GAME_OVER' && (
                <div className="mb-2 flex flex-col items-center gap-1">
                  <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-2xl bg-[#130F42]/90 border border-indigo-300/25 shadow-md">
                    <button
                      type="button"
                      onClick={handleToggleMic}
                      aria-label={micEnabled ? 'Turn Microphone Off' : 'Turn Microphone On'}
                      className={`h-8 px-3 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 ${
                        micEnabled
                          ? 'bg-gradient-to-b from-emerald-400 to-emerald-600 text-stone-950 border-b-2 border-emerald-800 shadow-[0_0_12px_rgba(16,185,129,0.45)]'
                          : 'bg-[#1D185B] text-indigo-200 border border-indigo-300/25 hover:bg-[#272175]'
                      }`}
                    >
                      {micEnabled ? (
                        <Mic className="w-3.5 h-3.5" />
                      ) : (
                        <MicOff className="w-3.5 h-3.5 text-rose-300" />
                      )}
                      <span>{micEnabled ? 'Mic On' : 'Mic Off'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleToggleSpeaker}
                      aria-label={speakerEnabled ? 'Mute Voice Speaker' : 'Unmute Voice Speaker'}
                      className={`h-8 px-3 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 ${
                        speakerEnabled
                          ? 'bg-gradient-to-b from-sky-400 to-blue-600 text-white border-b-2 border-blue-800 shadow-[0_0_12px_rgba(56,189,248,0.35)]'
                          : 'bg-[#1D185B] text-indigo-200/80 border border-indigo-300/25 hover:bg-[#272175]'
                      }`}
                    >
                      {speakerEnabled ? (
                        <Volume2 className="w-3.5 h-3.5" />
                      ) : (
                        <VolumeX className="w-3.5 h-3.5 text-rose-300" />
                      )}
                      <span>{speakerEnabled ? 'Speaker On' : 'Speaker Off'}</span>
                    </button>
                  </div>
                  {voiceError && (
                    <span className="text-[11px] font-semibold text-rose-300">
                      {voiceError}
                    </span>
                  )}
                </div>
              )}

              <LudoBoard
                gameState={gameState}
                localHumanSeats={localHumanSeats}
                onTokenClick={handleTokenClick}
              />

              <div className="w-full mt-3 sm:mt-4 flex justify-center">
                <DiceControl
                  diceValue={gameState.diceValue}
                  isRolling={isRollingAnim}
                  canRoll={canRoll}
                  activeSeat={activeSeat}
                  phase={gameState.phase}
                  isMyTurn={isMyTurn}
                  isOnlineMode={gameState.mode === 'online'}
                  secondsLeft={turnSecondsLeft}
                  turnTotalSeconds={30}
                  localReconnecting={localReconnecting}
                  onRoll={handleRollClick}
                />
              </div>
            </div>

            {/* Desktop Players on Board Roster */}
            <div className="hidden lg:block lg:col-span-4 w-full space-y-3">
              <div className="bg-gradient-to-b from-[#25216B]/95 to-[#17144A]/95 border border-indigo-300/25 rounded-2xl p-4 space-y-2.5 shadow-xl">
                <div className="text-xs font-bold text-indigo-200/80">Players on Board</div>
                <div className="space-y-2">
                  {gameState.seats
                    .filter((s) => s.type !== 'empty')
                    .map((seat) => {
                      const theme = COLOR_THEMES[seat.color];
                      const isTurn = seat.seatIndex === gameState.currentTurnSeat;
                      const isElim = Boolean(seat.eliminated);
                      const strikes = seat.strikes ?? 0;
                      const homeCount = gameState.tokens.filter(
                        (t) => t.seatIndex === seat.seatIndex && t.step === 56
                      ).length;
                      return (
                        <div
                          key={seat.seatIndex}
                          className={`flex items-center justify-between px-3 py-2 rounded-xl border transition-colors ${
                            isElim
                              ? 'border-rose-400/25 bg-rose-950/30 opacity-65'
                              : isTurn
                              ? 'border-amber-300/70 bg-[#2E2982]'
                              : 'border-indigo-300/20 bg-[#120F3F]/80'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span
                              className="w-3 h-3 rounded-full shrink-0 ring-2 ring-white/40"
                              style={{ backgroundColor: theme.primary }}
                            />
                            <span
                              className={`text-xs font-bold text-white truncate ${
                                isElim ? 'line-through opacity-75' : ''
                              }`}
                            >
                              {seat.name}
                            </span>
                            <span className="font-mono-id text-[11px] text-amber-300/90 shrink-0">
                              {seat.type === 'bot' ? 'CPU' : `#${seat.id}`}
                            </span>
                            {!isElim && strikes > 0 && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-400/40 text-[9px] font-bold text-amber-200 shrink-0">
                                Bot {Math.min(3, strikes)}/3
                              </span>
                            )}
                          </div>
                          <div className="text-xs font-semibold text-indigo-200 tabular-nums shrink-0">
                            {isElim
                              ? 'Eliminated'
                              : seat.finishedRank
                              ? `#${seat.finishedRank} Done`
                              : `${homeCount}/4 Home`}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Match Complete Modal (triggers showInterstitialAd) */}
      {view === 'playing' && gameState?.phase === 'GAME_OVER' && (
        <VictoryModal
          seats={gameState.seats}
          winnerOrder={gameState.winnerOrder}
          isOnlineGuest={gameState.mode === 'online' && onlineRole === 'guest'}
          onPlayAgain={handlePlayAgain}
          onBackToLobby={handleBackToLobby}
        />
      )}

      {/* Fixed 60px AdMob Banner Space */}
      <AdMobBanner />
    </div>
  );
}
