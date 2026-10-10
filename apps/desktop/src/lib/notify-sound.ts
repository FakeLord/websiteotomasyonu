const STORAGE_KEY = "lbf.notifySound";

/** Yeni cevapta ses: tarayıcı depolaması yoksa/engelliyse varsayılan açıktır. */
export function isNotifySoundEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setNotifySoundEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    // Depolama yoksa tercih yalnızca bu oturumda geçerlidir.
  }
}

/** Sayaç arttıysa bildir. İlk okumada (önceki değer yok) ses çalınmaz. */
export function shouldNotify(previous: number | null, next: number): boolean {
  return previous !== null && next > previous;
}

/** İki kısa nota; ek dosya gerektirmez. Tarayıcı sesi engellerse sessizce geçer. */
export function playNotifySound(): void {
  try {
    const AudioContextCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;
    const context = new AudioContextCtor();
    const start = context.currentTime;
    [660, 880].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start + index * 0.14);
      gain.gain.exponentialRampToValueAtTime(0.15, start + index * 0.14 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + index * 0.14 + 0.13);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start + index * 0.14);
      oscillator.stop(start + index * 0.14 + 0.14);
    });
    window.setTimeout(() => void context.close(), 600);
  } catch {
    // Ses çalınamazsa bildirim yine rozetle görünür.
  }
}
