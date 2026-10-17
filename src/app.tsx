// Root component: loads data, shows Setup on first run, otherwise header + screen + tab bar.
import { useEffect } from 'preact/hooks';
import { useRegisterSW } from 'virtual:pwa-register/preact';
import { Header, TabBar, ToastHost } from './components/ui';
import { ensureSeedFoods, requestPersistence } from './db/repo';
import { useRoute } from './lib/router';
import { AppStateProvider } from './lib/state';
import { Setup } from './screens/Setup';
import { More, SettingsScreen } from './screens/More';
import { Today } from './screens/Today';
import { FoodDay } from './screens/FoodDay';
import { FoodSearch } from './screens/FoodSearch';
import { FoodEdit } from './screens/FoodEdit';
import { RecipeEdit } from './screens/RecipeEdit';
import { Scanner } from './screens/Scanner';
import { CardioScreen } from './screens/Cardio';
import { CalendarScreen, DayDetail } from './screens/Calendar';
import { BodyScreen } from './screens/Body';
import { Progress } from './screens/Progress';
import { BackupScreen } from './screens/Backup';
import { useAutoSync } from './lib/sync';
import { RestTimerBar } from './components/RestTimer';

function Screen({ path }: { path: string }) {
  switch (path) {
    case '/today': return <Today />;
    case '/food': return <FoodDay />;
    case '/food/search': return <FoodSearch />;
    case '/food/edit': return <FoodEdit />;
    case '/food/recipe': return <RecipeEdit />;
    case '/food/scan': return <Scanner />;
    case '/calendar': return <CalendarScreen />;
    case '/day': return <DayDetail />;
    case '/progress': return <Progress />;
    case '/more': return <More />;
    case '/settings': return <SettingsScreen />;
    case '/cardio': return <CardioScreen />;
    case '/body': return <BodyScreen />;
    case '/backup': return <BackupScreen />;
    default: return <Today />;
  }
}

/**
 * Registers the service worker (offline cache) on the very first launch — even on the
 * Setup screen — and shows "Update available" when a new version was deployed.
 * It never reloads by itself, so an update can't interrupt a workout.
 */
function UpdatePrompt() {
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW();
  if (!needRefresh) return null;
  return (
    <div class="banner row between" style={{ margin: '8px 16px' }}>
      <span>New version available.</span>
      <button class="small primary" onClick={() => updateServiceWorker(true)}>Update</button>
    </div>
  );
}

function Shell() {
  const route = useRoute();
  useAutoSync();
  return (
    <>
      <Header />
      <main class="screen"><Screen path={route.path} /></main>
      <RestTimerBar />
      <TabBar path={route.path} />
      <ToastHost />
    </>
  );
}

export function App() {
  useEffect(() => {
    ensureSeedFoods().catch(console.error);
    requestPersistence();
  }, []);
  return (
    <>
      <UpdatePrompt />
      <AppStateProvider setup={<><Setup /><ToastHost /></>} loading={<main class="screen muted">Loading…</main>}>
        <Shell />
      </AppStateProvider>
    </>
  );
}
