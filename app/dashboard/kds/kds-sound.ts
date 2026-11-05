const STORAGE_KEY = "kds-sound-enabled";

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const BrowserAudioContext =
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!BrowserAudioContext) return null;
  if (!audioContext) {
    audioContext = new BrowserAudioContext();
  }
  return audioContext;
}

export function unlockKdsAudio(): void {
  const context = getAudioContext();
  if (context && context.state === "suspended") {
    void context.resume();
  }
}

function strike(context: AudioContext, startAt: number, gainLevel: number): void {
  const partials = [
    { frequency: 988, ratio: 1 },
    { frequency: 1480, ratio: 0.45 },
    { frequency: 1976, ratio: 0.2 },
  ];

  for (const partial of partials) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = partial.frequency;
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(gainLevel * partial.ratio, startAt + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.7);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + 0.75);
  }
}

export function playOrderBell(): void {
  const context = getAudioContext();
  if (!context) return;
  if (context.state === "suspended") {
    void context.resume();
  }
  const now = context.currentTime + 0.02;
  strike(context, now, 0.32);
  strike(context, now + 0.22, 0.18);
}

export function isSoundEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === null ? true : stored === "true";
  } catch {
    return true;
  }
}

export function setSoundEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, String(enabled));
  } catch {
    return;
  }
}
