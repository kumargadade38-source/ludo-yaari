import { SoundCue } from '../types/ludo';

class SoundEngine {
  private ctx: AudioContext | null = null;
  private busInput: AudioNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private muted = false;
  private unlocked = false;
  private listenersAttached = false;

  setMuted(muted: boolean) {
    this.muted = muted;
  }

  isMuted(): boolean {
    return this.muted;
  }

  initAutoUnlock() {
    if (typeof window === 'undefined' || this.listenersAttached) return;
    this.listenersAttached = true;

    const handleFirstGesture = () => {
      this.unlock();
    };

    const events = ['pointerdown', 'touchstart', 'mousedown', 'click', 'keydown'] as const;
    events.forEach((evt) => {
      window.addEventListener(evt, handleFirstGesture, { capture: true, passive: true });
    });
  }

  unlock() {
    if (typeof window === 'undefined') return;
    try {
      const ctx = this.getOrCreateContext();
      if (!ctx) return;

      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      if (!this.unlocked) {
        // Silent 1-sample buffer unlock for strict mobile Android WebView / iOS Safari policies
        const buffer = ctx.createBuffer(1, 1, 22050);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start(0);
        this.unlocked = true;
      }
    } catch {
      // Fail silently if Web Audio is blocked
    }
  }

  private getOrCreateContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();

      // Master compressor + gain bus so SFX stay loud, punchy, and distortion-free
      const compressor = this.ctx.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(-14, this.ctx.currentTime);
      compressor.knee.setValueAtTime(18, this.ctx.currentTime);
      compressor.ratio.setValueAtTime(6, this.ctx.currentTime);
      compressor.attack.setValueAtTime(0.003, this.ctx.currentTime);
      compressor.release.setValueAtTime(0.12, this.ctx.currentTime);

      const master = this.ctx.createGain();
      master.gain.setValueAtTime(0.95, this.ctx.currentTime);

      compressor.connect(master);
      master.connect(this.ctx.destination);
      this.busInput = compressor;
    }
    return this.ctx;
  }

  private ensurePlayableContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    const ctx = this.getOrCreateContext();
    if (!ctx) return null;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    return ctx;
  }

  private getNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noiseBuffer && this.noiseBuffer.sampleRate === ctx.sampleRate) {
      return this.noiseBuffer;
    }
    const length = Math.floor(ctx.sampleRate * 0.2);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buffer;
    return buffer;
  }

  private playTone(
    freq: number,
    duration: number,
    type: OscillatorType = 'sine',
    volume = 0.28,
    delay = 0,
    slideTo?: number
  ) {
    try {
      const ctx = this.ensurePlayableContext();
      if (!ctx || !this.busInput) return;

      const now = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(Math.max(20, freq), now);
      if (slideTo) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), now + duration);
      }

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(volume, now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      osc.connect(gain);
      gain.connect(this.busInput);
      osc.start(now);
      osc.stop(now + duration + 0.03);
    } catch {
      // Ignore audio scheduling errors
    }
  }

  private playNoiseClick(
    centerFreq: number,
    q: number,
    duration: number,
    volume: number,
    delay = 0
  ) {
    try {
      const ctx = this.ensurePlayableContext();
      if (!ctx || !this.busInput) return;

      const now = ctx.currentTime + delay;
      const src = ctx.createBufferSource();
      src.buffer = this.getNoiseBuffer(ctx);

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(centerFreq, now);
      filter.Q.setValueAtTime(q, now);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.busInput);
      src.start(now);
      src.stop(now + duration + 0.02);
    } catch {
      // Ignore audio scheduling errors
    }
  }

  play(cue: SoundCue, stepCount = 3) {
    if (this.muted || cue === 'none') return;
    const ctx = this.ensurePlayableContext();
    if (!ctx) return;

    switch (cue) {
      case 'dice': {
        // Rapid multi-click tumbling/shaking rattle sound
        const taps = [
          { t: 0.0, f: 240, n: 1850, v: 0.24 },
          { t: 0.052, f: 320, n: 2300, v: 0.22 },
          { t: 0.105, f: 270, n: 1950, v: 0.25 },
          { t: 0.162, f: 350, n: 2500, v: 0.23 },
          { t: 0.224, f: 285, n: 2100, v: 0.24 },
          { t: 0.29, f: 380, n: 2650, v: 0.27 },
        ];
        taps.forEach((tap) => {
          this.playTone(tap.f, 0.042, 'triangle', tap.v, tap.t, tap.f * 0.45);
          this.playNoiseClick(tap.n, 2.2, 0.036, tap.v * 1.1, tap.t);
        });
        break;
      }
      case 'six': {
        // Bright upbeat arcade chime for rolling a 6!
        const notes = [523.25, 659.25, 783.99, 1046.5, 1318.51];
        notes.forEach((n, idx) => {
          this.playTone(n, 0.18, 'triangle', 0.26, idx * 0.055);
          this.playTone(n * 2, 0.12, 'sine', 0.1, idx * 0.055);
        });
        break;
      }
      case 'move': {
        // Crisp wooden/pop "tick-tick-tick" hop sound for each square moved
        const hops = Math.min(6, Math.max(1, stepCount));
        for (let i = 0; i < hops; i++) {
          const delay = i * 0.062;
          const base = 470 + i * 36;
          this.playTone(base, 0.05, 'sine', 0.26, delay, base * 1.32);
          this.playTone(base * 1.5, 0.03, 'triangle', 0.14, delay, base * 1.8);
          this.playNoiseClick(1700 + i * 120, 3.0, 0.022, 0.16, delay);
        }
        break;
      }
      case 'open': {
        // Snappy launch pop when opening a token from home yard
        this.playTone(392, 0.08, 'sine', 0.28, 0, 587.33);
        this.playTone(659.25, 0.12, 'triangle', 0.26, 0.065, 880);
        this.playNoiseClick(2100, 2.4, 0.03, 0.18, 0);
        break;
      }
      case 'safe': {
        // Magical ascending star-zone bell chime
        const notes = [783.99, 987.77, 1174.66, 1567.98];
        notes.forEach((n, idx) => {
          this.playTone(n, 0.18, 'sine', 0.24, idx * 0.055);
          this.playTone(n, 0.14, 'triangle', 0.12, idx * 0.055);
        });
        break;
      }
      case 'capture': {
        // Dramatic laser/smash capture sound
        this.playTone(1150, 0.18, 'sawtooth', 0.24, 0, 120);
        this.playTone(720, 0.16, 'square', 0.14, 0.02, 95);
        this.playTone(210, 0.24, 'triangle', 0.34, 0.04, 48);
        this.playNoiseClick(1200, 0.9, 0.14, 0.32, 0.02);
        break;
      }
      case 'home': {
        // Magical ascending chime when reaching Home triangle
        const notes = [523.25, 659.25, 783.99, 987.77, 1046.5, 1318.51];
        notes.forEach((n, idx) => {
          this.playTone(n, 0.24, 'sine', 0.25, idx * 0.065);
          this.playTone(n * 1.5, 0.16, 'triangle', 0.1, idx * 0.065);
        });
        break;
      }
      case 'turn': {
        // Gentle ping when local player's turn starts
        this.playTone(783.99, 0.14, 'sine', 0.18, 0);
        this.playTone(1046.5, 0.22, 'sine', 0.2, 0.085);
        break;
      }
      case 'win': {
        // Cheerful celebratory fanfare melody
        const fanfare = [
          { f: 523.25, t: 0.0, d: 0.14 },
          { f: 659.25, t: 0.11, d: 0.14 },
          { f: 783.99, t: 0.22, d: 0.14 },
          { f: 1046.5, t: 0.34, d: 0.22 },
          { f: 783.99, t: 0.54, d: 0.14 },
          { f: 1046.5, t: 0.68, d: 0.42 },
        ];
        fanfare.forEach((n) => {
          this.playTone(n.f, n.d, 'triangle', 0.28, n.t);
          this.playTone(n.f * 0.5, n.d, 'sine', 0.16, n.t);
        });
        break;
      }
    }
  }
}

export const soundEngine = new SoundEngine();
