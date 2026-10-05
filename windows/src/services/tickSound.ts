/** The check-off tick (SoundService.swift): mono 44.1 kHz, 40 ms, sine 1200 Hz, no assets. */
export const TICK_SAMPLE_RATE = 44_100;
export const TICK_DURATION = 0.04;
export const TICK_FREQUENCY = 1200;
export const TICK_AMPLITUDE = 0.18;
/** AVAudioPlayer.volume on the Mac. */
export const TICK_VOLUME = 0.5;
export const TICK_MIN_INTERVAL_MS = 80;

/** `sin(2 pi f t) * min(1, t / 0.002) * exp(-110 t) * amplitude` for each sample. */
export function makeTickSamples(
  sampleRate = TICK_SAMPLE_RATE,
  duration = TICK_DURATION,
  frequency = TICK_FREQUENCY,
  amplitude = TICK_AMPLITUDE,
): Float32Array {
  const count = Math.floor(sampleRate * duration);
  const out = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const t = i / sampleRate;
    const envelope = Math.min(1, t / 0.002) * Math.exp(-t * 110);
    out[i] = Math.max(-1, Math.min(1, Math.sin(2 * Math.PI * frequency * t) * envelope * amplitude));
  }
  return out;
}
