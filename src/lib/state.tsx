// App-wide state shared by every screen: settings, sessions, swaps, current week and targets.
//
// Preact "context" ≈ a value every component below the Provider can read without
// passing it down by hand. useLiveQuery re-runs the query whenever the table changes,
// so the UI updates automatically after any save.
import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import { useLiveQuery } from 'dexie-react-hooks';
import type { ComponentChildren } from 'preact';
import { db } from '../db/db';
import { nextWorkout, getWeek, targetsForWeek, type NextWorkout, type Targets } from '../core';
import type { ProgramWeek, Session, Settings } from '../core/types';
import { program } from '../program';

export interface AppState {
  settings: Settings;
  sessions: Session[];               // not deleted, oldest first
  swaps: Map<string, string | null>; // base exercise → substitute
  next: NextWorkout;
  week: number;                      // current program week
  weekInfo: ProgramWeek;
  targets: Targets;
}

const Ctx = createContext<AppState | null>(null);

/** Loads settings + sessions. Renders `setup` until settings exist. */
export function AppStateProvider(props: { children: ComponentChildren; setup: ComponentChildren; loading: ComponentChildren }) {
  const settings = useLiveQuery(() => db.settings.get('me').then((s) => s ?? null), []);
  const sessions = useLiveQuery(() => db.sessions.orderBy('date').filter((s) => !s.deleted).toArray(), []);
  const swapRows = useLiveQuery(() => db.swaps.toArray(), []);
  if (settings === undefined || sessions === undefined || swapRows === undefined) return <>{props.loading}</>;
  if (settings === null || settings.deleted) return <>{props.setup}</>;
  const next = nextWorkout(program, sessions);
  const state: AppState = {
    settings,
    sessions,
    swaps: new Map(swapRows.filter((r) => !r.deleted).map((r) => [r.id, r.substitute])),
    next,
    week: next.week,
    weekInfo: getWeek(program, next.week),
    targets: targetsForWeek(program, settings, next.week),
  };
  return <Ctx.Provider value={state}>{props.children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const s = useContext(Ctx);
  if (!s) throw new Error('useApp outside provider');
  return s;
}
