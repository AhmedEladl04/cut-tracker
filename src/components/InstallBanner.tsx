// "Add to Home Screen" help. iOS has no install button for websites, so we explain
// Share → Add to Home Screen. Android Chrome fires `beforeinstallprompt`, which we turn
// into an Install button.
import { useEffect, useState } from 'preact/hooks';

export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const isStandalone = () =>
  matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

// Saved Android install event (it fires once, early, so capture it at module load).
let deferredPrompt: (Event & { prompt: () => Promise<void> }) | null = null;
addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e as typeof deferredPrompt;
});

const KEY = 'installBannerDismissed';
const lsGet = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };

export function InstallHelp() {
  const [canPrompt, setCanPrompt] = useState(!!deferredPrompt);
  useEffect(() => {
    const on = () => setCanPrompt(true);
    addEventListener('beforeinstallprompt', on);
    return () => removeEventListener('beforeinstallprompt', on);
  }, []);
  if (isStandalone()) return <p class="small muted">✅ Running as an installed app.</p>;
  if (isIOS()) {
    return (
      <div class="small">
        <p><b>iPhone:</b> open this page in <b>Safari</b>, tap the <b>Share</b> button (square with ↑), scroll down and tap <b>“Add to Home Screen”</b>, then <b>Add</b>.</p>
        <p class="muted">Always open the app from the home-screen icon — iOS keeps an installed app's data much more reliably than a Safari tab.</p>
      </div>
    );
  }
  return (
    <div class="small">
      {canPrompt ? (
        <button class="primary" onClick={async () => { await deferredPrompt?.prompt(); deferredPrompt = null; setCanPrompt(false); }}>Install app</button>
      ) : (
        <p><b>Android:</b> in Chrome tap ⋮ → <b>“Install app”</b> (or “Add to Home screen”).</p>
      )}
    </div>
  );
}

/** One-time banner shown on the Today screen until dismissed or installed. */
export function InstallBanner() {
  const [hidden, setHidden] = useState(() => isStandalone() || lsGet(KEY) === '1');
  if (hidden) return null;
  return (
    <div class="card info">
      <div class="row between"><b>📲 Install this app</b>
        <button class="ghost small" onClick={() => { lsSet(KEY, '1'); setHidden(true); }}>Dismiss</button>
      </div>
      <InstallHelp />
    </div>
  );
}
