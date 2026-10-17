import { useApp } from '../lib/state';
import { SettingsForm } from './Setup';
import { InstallHelp } from '../components/InstallBanner';

export function More() {
  return (
    <>
      <h1>More</h1>
      <div class="card menu" style={{ padding: 0 }}>
        <a href="#/cardio"><span class="ico">🚶</span>Cardio & steps</a>
        <a href="#/body"><span class="ico">⚖️</span>Body weight & weekly check-in</a>
        <a href="#/backup"><span class="ico">💾</span>Backup, export & sync</a>
        <a href="#/settings"><span class="ico">⚙️</span>Settings (bodyweight, 1RMs, calories)</a>
      </div>
      <h2>Install on your phone</h2>
      <InstallHelp />
    </>
  );
}

export function SettingsScreen() {
  const { settings } = useApp();
  return (
    <>
      <h1>Settings</h1>
      {/* key forces a fresh form if settings change elsewhere (e.g. after an import) */}
      <SettingsForm key={settings.updatedAt} initial={settings} firstRun={false} />
    </>
  );
}
