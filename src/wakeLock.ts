let sentinel: WakeLockSentinel | null = null;
let wanted = false;

async function request() {
  if (!('wakeLock' in navigator)) return;
  try {
    sentinel = await navigator.wakeLock.request('screen');
    sentinel.addEventListener('release', () => {
      sentinel = null;
    });
  } catch {
    // Negado (ex.: economia de bateria) — o exercício segue sem wake lock.
    sentinel = null;
  }
}

function onVisibility() {
  // O sistema libera o wake lock quando a página fica oculta;
  // readquirimos ao voltar.
  if (wanted && document.visibilityState === 'visible' && !sentinel) {
    void request();
  }
}

export async function acquireWakeLock() {
  wanted = true;
  document.addEventListener('visibilitychange', onVisibility);
  await request();
}

export function releaseWakeLock() {
  wanted = false;
  document.removeEventListener('visibilitychange', onVisibility);
  void sentinel?.release().catch(() => undefined);
  sentinel = null;
}
