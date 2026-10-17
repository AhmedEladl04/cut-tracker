// Backup, restore, CSV export and laptop-sync settings.
import { useState } from 'preact/hooks';
import { useLiveQuery } from 'dexie-react-hooks';
import { daysSince } from '../core/stats';
import { useLastBackup } from '../components/Banners';
import { Field, toast } from '../components/ui';
import { db } from '../db/db';
import { requestPersistence, saveSettings } from '../db/repo';
import { exportBackup, exportCsv, importBackup } from '../lib/backup';
import { useApp } from '../lib/state';
import { syncNow } from '../lib/sync';

function ago(ts: number | null | undefined) {
  const d = daysSince(ts, Date.now());
  return d == null ? 'never' : d === 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
}

export function BackupScreen() {
  const { settings } = useApp();
  const lastBackup = useLastBackup();
  const lastSync = useLiveQuery(() => db.meta.get('lastSyncAt').then((m) => (m?.value as number | undefined) ?? null), []);
  const persisted = useLiveQuery(async () => (navigator.storage?.persisted ? navigator.storage.persisted() : false), []);
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [url, setUrl] = useState(settings.syncUrl);
  const [token, setToken] = useState(settings.syncToken);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  async function onImport(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (mode === 'replace' && !confirm('Replace ALL data on this phone with the backup?')) return;
    try {
      const n = await importBackup(file, mode);
      toast(`Imported ${n} records`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Import failed');
    }
  }

  async function doSync() {
    await saveSettings({ syncUrl: url.trim(), syncToken: token.trim() });
    setSyncMsg('Syncing…');
    try {
      const r = await syncNow();
      setSyncMsg(`✅ Synced: sent ${r.pushed}, received ${r.pulled} records.`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setSyncMsg(`❌ ${msg.includes('abort') ? 'Server not reachable (are you on home Wi-Fi?)' : msg}. If you never opened the server URL in Safari, do that once to trust its certificate.`);
    }
  }

  return (
    <>
      <h1>Backup & sync</h1>
      <div class="card">
        <div class="row between"><span>Last backup</span><b>{ago(lastBackup)}</b></div>
        <div class="row between small muted"><span>Storage protected from cleanup</span><span>{persisted ? 'yes' : 'no'}</span></div>
        {!persisted && <button class="small" onClick={async () => toast((await requestPersistence()) ? 'Storage protected' : 'Browser declined — install to home screen and back up often')}>Request protection</button>}
        <p class="small muted">Everything lives only on this phone. iOS can still delete website data, so export a backup weekly (Files → iCloud Drive is ideal).</p>
        <button class="primary block" onClick={async () => { if (await exportBackup()) toast('Backup exported'); }}>💾 Export backup (JSON)</button>
      </div>

      <h2>Restore</h2>
      <div class="card">
        <div class="seg">
          <button class={mode === 'merge' ? 'on' : ''} onClick={() => setMode('merge')}>Merge (keep newer)</button>
          <button class={mode === 'replace' ? 'on' : ''} onClick={() => setMode('replace')}>Replace all</button>
        </div>
        <label class="btn block" style={{ marginTop: 10, color: 'var(--text)' }}>
          📂 Import backup file
          <input type="file" accept="application/json,.json" onChange={onImport} style={{ display: 'none' }} />
        </label>
      </div>

      <h2>Export CSV</h2>
      <div class="grid3">
        <button onClick={() => exportCsv('workouts')}>Workouts</button>
        <button onClick={() => exportCsv('food')}>Food</button>
        <button onClick={() => exportCsv('weight')}>Weight</button>
      </div>

      <h2>Laptop sync (optional)</h2>
      <div class="card">
        <p class="small muted">Run the server in <code>server/</code> on your laptop. When your phone is on the same Wi-Fi, the app sends its changes automatically (on open and after each workout); the laptop keeps 14 daily backups. Last sync: <b>{ago(lastSync)}</b>.</p>
        <Field label="Server URL" hint="e.g. https://192.168.1.20:8765">
          <input type="url" inputMode="url" autoCapitalize="off" value={url} onInput={(e) => setUrl((e.target as HTMLInputElement).value)} placeholder="https://192.168.1.20:8765" />
        </Field>
        <Field label="Sync token" hint="The SYNC_TOKEN printed when the server starts">
          <input autoCapitalize="off" autoComplete="off" value={token} onInput={(e) => setToken((e.target as HTMLInputElement).value)} />
        </Field>
        <button class="block" style={{ marginTop: 10 }} disabled={!url.trim()} onClick={doSync}>⇅ Save & sync now</button>
        {syncMsg && <p class="small">{syncMsg}</p>}
      </div>
    </>
  );
}
