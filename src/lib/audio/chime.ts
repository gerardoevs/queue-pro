/**
 * Plays a pleasant airport/hospital style queue chime using the Web Audio API.
 * Does not require external audio files or network requests.
 */
export function playQueueChime(): void {
  if (typeof window === 'undefined') return;

  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    // Two-tone bell chime: E5 (659.25Hz) -> C5 (523.25Hz) or G4 -> C5
    const notes = [
      { freq: 587.33, time: 0, duration: 0.35 }, // D5
      { freq: 880.0, time: 0.25, duration: 0.6 }, // A5
    ];

    notes.forEach(({ freq, time, duration }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + time);

      // Volume envelope (smooth attack & decay)
      gain.gain.setValueAtTime(0, now + time);
      gain.gain.linearRampToValueAtTime(0.3, now + time + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + time + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + time);
      osc.stop(now + time + duration);
    });
  } catch (err) {
    console.warn('Could not play chime:', err);
  }
}
