import Peer, { DataConnection, MediaConnection } from 'peerjs';
import { PeerMessage, PlayerProfile } from '../types/ludo';

const PEER_PREFIX = 'ludo-p2p-v1-';

export function toPeerJsId(sixDigitId: string): string {
  return `${PEER_PREFIX}${sixDigitId.trim()}`;
}

export function fromPeerJsId(peerJsId: string): string {
  return peerJsId.startsWith(PEER_PREFIX)
    ? peerJsId.slice(PEER_PREFIX.length)
    : peerJsId;
}

export interface PeerCallbacks {
  onReady: (sixDigitId: string) => void;
  onConnectionOpen: (remoteId: string, conn: DataConnection) => void;
  onMessage: (remoteId: string, msg: PeerMessage, conn: DataConnection) => void;
  onConnectionClose: (remoteId: string) => void;
  onError: (message: string) => void;
  onVoiceError?: (message: string) => void;
}

export class LudoPeerManager {
  private peer: Peer | null = null;
  private connections: Map<string, DataConnection> = new Map();
  private lastActivityAt: Map<string, number> = new Map();
  private connectTimers: Map<string, number> = new Map();
  private intentionallyClosed: WeakSet<DataConnection> = new WeakSet();
  private callbacks: PeerCallbacks;
  private localProfile: PlayerProfile | null = null;

  // Full-Mesh WebRTC Voice Chat (100% private local state; zero remote status leaks)
  private localVoiceStream: MediaStream | null = null;
  private outgoingVoiceCalls: Map<string, MediaConnection> = new Map();
  private incomingVoiceCalls: Map<string, MediaConnection> = new Map();
  private remoteAudioElements: Map<string, HTMLAudioElement> = new Map();
  private voiceSpeakerEnabled = true;
  private activeVoicePeerIds: string[] = [];
  private isVoiceMatchActive = false;

  constructor(callbacks: PeerCallbacks) {
    this.callbacks = callbacks;
  }

  init(profile: PlayerProfile): void {
    this.destroy();
    this.localProfile = profile;

    const peerId = toPeerJsId(profile.id);
    this.peer = new Peer(peerId, {
      debug: 0,
      config: {
        iceCandidatePoolSize: 10,
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          { urls: 'stun:stun3.l.google.com:19302' },
          { urls: 'stun:stun4.l.google.com:19302' },
        ],
      },
    });

    this.peer.on('open', (id) => {
      this.callbacks.onReady(fromPeerJsId(id));
    });

    this.peer.on('connection', (conn) => {
      this.attachConnection(conn, false);
    });

    this.peer.on('call', (call) => {
      this.handleIncomingVoiceCall(call);
    });

    this.peer.on('disconnected', () => {
      // Attempt gentle reconnect to signaling server if peer was not destroyed
      if (this.peer && !this.peer.destroyed) {
        try {
          this.peer.reconnect();
        } catch {
          // ignore
        }
      }
    });

    this.peer.on('error', (err) => {
      this.clearAllConnectTimers();
      const errType = (err as { type?: string })?.type || '';
      if (errType === 'peer-unavailable') {
        this.callbacks.onError('Friend is offline or their room is not open yet.');
      } else if (errType === 'unavailable-id') {
        this.callbacks.onError('Your ID is already active in another tab.');
      } else if (errType === 'network' || errType === 'server-error') {
        this.callbacks.onError('Network issue reaching PeerJS server. Check connection and retry.');
      } else {
        this.callbacks.onError(err.message || 'Connection error');
      }
    });
  }

  private clearConnectTimer(remoteId: string): void {
    const timer = this.connectTimers.get(remoteId);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      this.connectTimers.delete(remoteId);
    }
  }

  private clearAllConnectTimers(): void {
    for (const timer of this.connectTimers.values()) {
      window.clearTimeout(timer);
    }
    this.connectTimers.clear();
  }

  connectToFriend(friendSixDigitId: string, options?: { skipHello?: boolean }): void {
    if (!this.peer || this.peer.destroyed) {
      this.callbacks.onError('Peer connection is not ready yet. Please wait a moment.');
      return;
    }
    const skipHello = Boolean(options?.skipHello);
    const targetPeerId = toPeerJsId(friendSixDigitId);
    if (this.connections.has(friendSixDigitId)) {
      const existing = this.connections.get(friendSixDigitId);
      if (existing && existing.open) {
        if (!skipHello && this.localProfile) {
          existing.send({ type: 'HELLO', profile: this.localProfile } satisfies PeerMessage);
        } else {
          this.callbacks.onConnectionOpen(friendSixDigitId, existing);
        }
        return;
      }
    }

    const conn = this.peer.connect(targetPeerId, {
      reliable: true,
      serialization: 'json',
    });

    this.clearConnectTimer(friendSixDigitId);
    const timeoutId = window.setTimeout(() => {
      this.connectTimers.delete(friendSixDigitId);
      if (!conn.open) {
        this.intentionallyClosed.add(conn);
        try {
          conn.close();
        } catch {
          // ignore
        }
        this.callbacks.onError(
          'Connection timed out across mobile network. Make sure your friend has the app open and try again.'
        );
      }
    }, 12000);
    this.connectTimers.set(friendSixDigitId, timeoutId);

    this.attachConnection(conn, skipHello);
  }

  inviteFriend(friendSixDigitId: string, hostProfile: PlayerProfile): void {
    if (!this.peer || this.peer.destroyed) {
      this.callbacks.onError('Peer connection is not ready yet.');
      return;
    }
    const targetPeerId = toPeerJsId(friendSixDigitId);
    const existing = this.connections.get(friendSixDigitId);
    if (existing && existing.open) {
      existing.send({ type: 'INVITE', hostProfile } satisfies PeerMessage);
      return;
    }

    const conn = this.peer.connect(targetPeerId, {
      reliable: true,
      serialization: 'json',
    });
    conn.on('open', () => {
      conn.send({ type: 'INVITE', hostProfile } satisfies PeerMessage);
      window.setTimeout(() => {
        this.intentionallyClosed.add(conn);
        try {
          conn.close();
        } catch {
          // ignore
        }
      }, 600);
    });
    conn.on('error', () => {
      this.callbacks.onError('Could not reach that friend right now.');
    });
  }

  private attachConnection(conn: DataConnection, skipAutoHello: boolean): void {
    const remoteId = fromPeerJsId(conn.peer);

    conn.on('open', () => {
      if (this.intentionallyClosed.has(conn)) return;
      this.clearConnectTimer(remoteId);
      this.connections.set(remoteId, conn);
      this.lastActivityAt.set(remoteId, Date.now());
      if (!skipAutoHello && this.localProfile) {
        conn.send({ type: 'HELLO', profile: this.localProfile } satisfies PeerMessage);
      }
      this.callbacks.onConnectionOpen(remoteId, conn);
    });

    conn.on('data', (raw) => {
      if (this.intentionallyClosed.has(conn)) return;
      this.lastActivityAt.set(remoteId, Date.now());
      if (raw && typeof raw === 'object' && 'type' in raw) {
        this.callbacks.onMessage(remoteId, raw as PeerMessage, conn);
      }
    });

    conn.on('close', () => {
      this.clearConnectTimer(remoteId);
      if (this.connections.get(remoteId) === conn) {
        this.connections.delete(remoteId);
        this.lastActivityAt.delete(remoteId);
        if (!this.intentionallyClosed.has(conn)) {
          this.callbacks.onConnectionClose(remoteId);
        }
      }
    });

    conn.on('error', () => {
      this.clearConnectTimer(remoteId);
      if (this.connections.get(remoteId) === conn) {
        this.connections.delete(remoteId);
        this.lastActivityAt.delete(remoteId);
        if (!this.intentionallyClosed.has(conn)) {
          this.callbacks.onConnectionClose(remoteId);
        }
      }
    });
  }

  sendTo(remoteSixDigitId: string, msg: PeerMessage): void {
    const conn = this.connections.get(remoteSixDigitId);
    if (conn && conn.open) {
      conn.send(msg);
    }
  }

  broadcast(msg: PeerMessage): void {
    for (const conn of this.connections.values()) {
      if (conn.open) {
        conn.send(msg);
      }
    }
  }

  closeConnection(remoteSixDigitId: string): void {
    this.clearConnectTimer(remoteSixDigitId);
    const conn = this.connections.get(remoteSixDigitId);
    if (conn) {
      this.intentionallyClosed.add(conn);
      try {
        conn.close();
      } catch {
        // ignore
      }
      this.connections.delete(remoteSixDigitId);
      this.lastActivityAt.delete(remoteSixDigitId);
    }
  }

  closeAllConnections(): void {
    this.clearAllConnectTimers();
    for (const conn of this.connections.values()) {
      this.intentionallyClosed.add(conn);
      try {
        conn.close();
      } catch {
        // ignore
      }
    }
    this.connections.clear();
    this.lastActivityAt.clear();
  }

  hasOpenConnection(remoteSixDigitId: string): boolean {
    const conn = this.connections.get(remoteSixDigitId);
    return Boolean(conn && conn.open);
  }

  getLastActivityAt(remoteSixDigitId: string): number {
    return this.lastActivityAt.get(remoteSixDigitId) ?? 0;
  }

  getOpenConnectionIds(): string[] {
    const ids: string[] = [];
    for (const [id, conn] of this.connections.entries()) {
      if (conn.open) ids.push(id);
    }
    return ids;
  }

  ensureServerConnected(): void {
    if (this.peer && !this.peer.destroyed && this.peer.disconnected) {
      try {
        this.peer.reconnect();
      } catch {
        // ignore
      }
    } else if ((!this.peer || this.peer.destroyed) && this.localProfile) {
      this.init(this.localProfile);
    }
  }

  isPeerOpen(): boolean {
    return Boolean(this.peer && !this.peer.destroyed && this.peer.open);
  }

  // =========================================================================
  // Secret Full-Mesh WebRTC Voice Chat (Audio Only, Zero Remote Indicators)
  // =========================================================================

  async startVoiceMic(peerIds: string[]): Promise<boolean> {
    this.isVoiceMatchActive = true;
    this.activeVoicePeerIds = peerIds;
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      this.callbacks.onVoiceError?.('Microphone is not supported on this device/browser.');
      return false;
    }

    try {
      if (!this.localVoiceStream) {
        this.localVoiceStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });
      }
      this.syncVoiceMeshPeers(peerIds);
      return true;
    } catch {
      this.callbacks.onVoiceError?.('Microphone permission denied or unavailable.');
      return false;
    }
  }

  stopVoiceMic(): void {
    for (const call of this.outgoingVoiceCalls.values()) {
      try {
        call.close();
      } catch {
        // ignore
      }
    }
    this.outgoingVoiceCalls.clear();

    if (this.localVoiceStream) {
      for (const track of this.localVoiceStream.getTracks()) {
        try {
          track.stop();
        } catch {
          // ignore
        }
      }
      this.localVoiceStream = null;
    }
  }

  setVoiceSpeakerEnabled(enabled: boolean): void {
    this.voiceSpeakerEnabled = enabled;
    for (const audio of this.remoteAudioElements.values()) {
      audio.muted = !enabled;
      audio.volume = enabled ? 1 : 0;
      if (enabled) {
        audio.play().catch(() => {
          // ignore autoplay restrictions
        });
      }
    }
  }

  syncVoiceMeshPeers(peerIds: string[], forceRecallPeerId?: string): void {
    this.isVoiceMatchActive = peerIds.length > 0;
    this.activeVoicePeerIds = peerIds;
    const validSet = new Set(peerIds);

    // Clean up outgoing calls to peers who left/were eliminated
    for (const [id, call] of this.outgoingVoiceCalls.entries()) {
      if (!validSet.has(id)) {
        try {
          call.close();
        } catch {
          // ignore
        }
        this.outgoingVoiceCalls.delete(id);
      }
    }

    if (!this.localVoiceStream || !this.peer || this.peer.destroyed || !this.peer.open) {
      return;
    }

    for (const remoteId of peerIds) {
      if (!remoteId || remoteId === this.localProfile?.id) continue;
      const existing = this.outgoingVoiceCalls.get(remoteId);
      const needsCall =
        forceRecallPeerId === remoteId || !existing || !existing.open;

      if (needsCall) {
        if (existing) {
          try {
            existing.close();
          } catch {
            // ignore
          }
          this.outgoingVoiceCalls.delete(remoteId);
        }
        try {
          const call = this.peer.call(toPeerJsId(remoteId), this.localVoiceStream);
          if (call) {
            this.attachOutgoingVoiceCall(remoteId, call);
          }
        } catch {
          // ignore transient call errors
        }
      }
    }
  }

  private attachOutgoingVoiceCall(remoteId: string, call: MediaConnection): void {
    this.outgoingVoiceCalls.set(remoteId, call);
    call.on('close', () => {
      if (this.outgoingVoiceCalls.get(remoteId) === call) {
        this.outgoingVoiceCalls.delete(remoteId);
      }
    });
    call.on('error', () => {
      if (this.outgoingVoiceCalls.get(remoteId) === call) {
        this.outgoingVoiceCalls.delete(remoteId);
      }
    });
  }

  private handleIncomingVoiceCall(call: MediaConnection): void {
    const remoteId = fromPeerJsId(call.peer);
    if (!this.isVoiceMatchActive || !this.activeVoicePeerIds.includes(remoteId)) {
      try {
        call.close();
      } catch {
        // ignore
      }
      return;
    }

    const prev = this.incomingVoiceCalls.get(remoteId);
    if (prev && prev !== call) {
      try {
        prev.close();
      } catch {
        // ignore
      }
    }
    this.incomingVoiceCalls.set(remoteId, call);

    try {
      // Answer receive-only (never expose local mic unless caller separately initiates outgoing call)
      call.answer();
    } catch {
      return;
    }

    call.on('stream', (remoteStream) => {
      this.playRemoteVoiceStream(remoteId, remoteStream);
    });

    call.on('close', () => {
      if (this.incomingVoiceCalls.get(remoteId) === call) {
        this.incomingVoiceCalls.delete(remoteId);
        this.removeRemoteAudioElement(remoteId);
      }
    });

    call.on('error', () => {
      if (this.incomingVoiceCalls.get(remoteId) === call) {
        this.incomingVoiceCalls.delete(remoteId);
        this.removeRemoteAudioElement(remoteId);
      }
    });
  }

  private playRemoteVoiceStream(remoteId: string, stream: MediaStream): void {
    let audio = this.remoteAudioElements.get(remoteId);
    if (!audio) {
      audio = document.createElement('audio');
      audio.autoplay = true;
      audio.setAttribute('playsinline', 'true');
      this.remoteAudioElements.set(remoteId, audio);
    }
    audio.srcObject = stream;
    audio.muted = !this.voiceSpeakerEnabled;
    audio.volume = this.voiceSpeakerEnabled ? 1 : 0;
    audio.play().catch(() => {
      // Autoplay will resume when Speaker toggle or dice tap triggers user gesture
    });
  }

  private removeRemoteAudioElement(remoteId: string): void {
    const audio = this.remoteAudioElements.get(remoteId);
    if (audio) {
      try {
        audio.pause();
        audio.srcObject = null;
      } catch {
        // ignore
      }
      this.remoteAudioElements.delete(remoteId);
    }
  }

  stopAllVoiceChat(): void {
    this.isVoiceMatchActive = false;
    this.activeVoicePeerIds = [];
    this.stopVoiceMic();

    for (const call of this.incomingVoiceCalls.values()) {
      try {
        call.close();
      } catch {
        // ignore
      }
    }
    this.incomingVoiceCalls.clear();

    for (const remoteId of Array.from(this.remoteAudioElements.keys())) {
      this.removeRemoteAudioElement(remoteId);
    }
  }

  destroy(): void {
    this.stopAllVoiceChat();
    this.closeAllConnections();
    if (this.peer) {
      try {
        this.peer.destroy();
      } catch {
        // ignore
      }
      this.peer = null;
    }
  }
}
