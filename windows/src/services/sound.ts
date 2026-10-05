import { TickThrottle } from "../domain/store/miniList";
import { TICK_MIN_INTERVAL_MS, TICK_SAMPLE_RATE, TICK_VOLUME, makeTickSamples } from "./tickSound";

/** The slice of WebAudio the service uses (so tests can fake it). */
export interface AudioPort {
  state: string;
  resume(): Promise<void>;
  /** Plays the prepared buffer once at `volume`. */
  playBuffer(samples: Float32Array, sampleRate: number, volume: number): void;
}

export function webAudioPort(): AudioPort | null {
  const Ctor = (globalThis as { AudioContext?: typeof AudioContext }).AudioContext;
  if (!Ctor) return null;
  const ctx = new Ctor();
  let buffer: AudioBuffer | null = null;
  return {
    get state() {
      return ctx.state;
    },
    resume: () => ctx.resume(),
    playBuffer(samples, sampleRate, volume) {
      if (!buffer) {
        buffer = ctx.createBuffer(1, samples.length, sampleRate);
        buffer.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
      }
      const src = ctx.createBufferSource();
      const gain = ctx.createGain();
      gain.gain.value = volume;
      src.buffer = buffer;
      src.connect(gain).connect(ctx.destination);
      src.start();
    },
  };
}

/** Hub-window sound player. `tick()` respects the setting; `play()` ignores it (Settings "Test"). Both throttle. */
export class SoundService {
  private readonly throttle = new TickThrottle(TICK_MIN_INTERVAL_MS);
  private audio: AudioPort | null | undefined;
  private samples: Float32Array | undefined;

  constructor(
    private readonly soundsEnabled: () => boolean,
    private readonly makeAudio: () => AudioPort | null = webAudioPort,
    private readonly nowMs: () => number = () => performance.now(),
  ) {}

  tick(): boolean {
    return this.soundsEnabled() ? this.play() : false;
  }

  play(): boolean {
    if (!this.throttle.allow(this.nowMs())) return false;
    if (this.audio === undefined) this.audio = this.makeAudio();
    if (!this.audio) return false;
    this.samples ??= makeTickSamples();
    if (this.audio.state === "suspended") void this.audio.resume().catch(() => {});
    this.audio.playBuffer(this.samples, TICK_SAMPLE_RATE, TICK_VOLUME);
    return true;
  }

  /** Call after the first user gesture (WebView2 autoplay). */
  unlock(): void {
    this.audio ??= this.makeAudio();
    if (this.audio?.state === "suspended") void this.audio.resume().catch(() => {});
  }
}
