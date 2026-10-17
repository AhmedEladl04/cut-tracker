// Barcode scanner using the rear camera (ZXing — works in iOS Safari, which has no
// BarcodeDetector). Order of lookup: local foods → Open Food Facts → manual form.
// The camera needs HTTPS (GitHub Pages, or `npm run dev:https` locally).
import { useEffect, useRef, useState } from 'preact/hooks';
import { today } from '../core/dates';
import type { OffConversion } from '../core/off';
import type { Food, Meal } from '../core/types';
import { FoodLogModal } from '../components/FoodLogModal';
import { db } from '../db/db';
import { save } from '../db/repo';
import { go, useRoute } from '../lib/router';
import { lookupBarcode } from '../lib/off';

/** Store an Open Food Facts product locally (so it works offline next time). Keeps your edits. */
export async function cacheOffFood(c: OffConversion): Promise<Food> {
  const existing = await db.foods.get(c.food.id);
  if (existing && !existing.deleted) return existing;
  const { updatedAt: _u, ...rest } = c.food;
  return save('foods', rest);
}

export function Scanner() {
  const { query } = useRoute();
  const meal = (query.meal as Meal) || 'snack';
  const date = query.date || today();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState('Starting camera…');
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState('');
  const [found, setFound] = useState<Food | null>(null);
  const busy = useRef(false);

  async function handle(code: string) {
    if (busy.current) return;
    busy.current = true;
    navigator.vibrate?.(80);
    setStatus(`Barcode ${code} — looking up…`);
    try {
      // 1) Already on the phone?
      const local = await db.foods.where('barcode').equals(code).filter((f) => !f.deleted).first();
      if (local) { setFound(local); return; }
      // 2) Open Food Facts (online only)
      if (navigator.onLine) {
        const c = await lookupBarcode(code);
        if (c) {
          const food = await cacheOffFood(c);
          if (c.missing.length) go('/food/edit', { id: food.id, missing: c.missing.join(','), meal, date });
          else setFound(food);
          return;
        }
      }
      // 3) Not found / offline → manual form prefilled with the barcode
      go('/food/edit', { barcode: code, meal, date });
    } catch (e) {
      setError(e instanceof Error && e.message !== 'offline' ? e.message : 'Lookup failed.');
      go('/food/edit', { barcode: code, meal, date });
    } finally {
      busy.current = false;
    }
  }

  useEffect(() => {
    let controls: { stop: () => void } | null = null;
    let cancelled = false;
    (async () => {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setError('Camera needs HTTPS. Open the installed app (GitHub Pages) or type the barcode below.');
        return;
      }
      try {
        // Loaded only when scanning, to keep app start fast.
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        const reader = new BrowserMultiFormatReader();
        if (cancelled || !videoRef.current) return;
        controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' } }, audio: false },
          videoRef.current,
          (result) => {
            if (result && !busy.current) {
              controls?.stop();
              handle(result.getText());
            }
          },
        );
        setStatus('Point the camera at the barcode');
      } catch (e) {
        setError(`Camera unavailable: ${e instanceof Error ? e.message : e}. Allow camera access, or type the barcode below.`);
      }
    })();
    return () => { cancelled = true; controls?.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div class="row between">
        <h1>Scan barcode</h1>
        <button class="small" onClick={() => history.back()}>Cancel</button>
      </div>
      {/* playsInline + muted are required for iOS to show live video inline */}
      <video ref={videoRef} class="scanner" playsInline muted autoPlay />
      <p class="small muted center">{status}</p>
      {error && <div class="card warn small">{error}</div>}
      <label>Or type the barcode</label>
      <div class="row">
        {/* text, not a number: barcodes can start with 0 */}
        <input inputMode="numeric" value={manual} placeholder="e.g. 6223000350065" onInput={(e) => setManual((e.target as HTMLInputElement).value.replace(/\D/g, ''))} />
        <button class="primary" disabled={manual.length < 6} onClick={() => handle(manual)}>Look up</button>
      </div>
      {found && <FoodLogModal food={found} date={date} meal={meal} onClose={() => { setFound(null); go('/food', { date }); }} />}
    </>
  );
}
