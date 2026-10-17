// Rest timer that survives the screen locking.
//
// iOS freezes JavaScript when the phone is locked or the app is in the background, so a
// countdown (setInterval -1 each second) would be wrong when you come back. Instead we
// store the END TIME (a timestamp) in localStorage and compute "time left = endAt - now"
// whenever we draw. When the app wakes up again it is instantly correct.
//
// At the end we: play a beep (Web Audio), vibrate (Android only — iPhone has no
// Vibration API), and show a notification if permission was granted. A notification
// can only be shown while JS runs, so on a locked iPhone it appears when iOS lets the
// app run again; the on-screen alert + sound always happens when you return.
import { useEffect, useState } from 'preact/hooks';

export interface TimerState { endAt: number; duration: number; label: string; alerted: boolean }

const KEY = 'restTimer';
let state: TimerState | null = load();
const listeners = new Set<() => void>();

function load(): TimerState | null {
  try { return JSON.parse(localStorage.getItem(KEY) ?? 'null'); } catch { return null; }
}
function persist() {
  try { state ? localStorage.setItem(KEY, JSON.stringify(state)) : localStorage.removeItem(KEY); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}

// ---------- sound ----------
let audio: AudioContext | null = null;
/** Must be called from a tap (iOS only allows audio that was "unlocked" by a user gesture). */
export function unlockAudio() {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audio ??= new AC();
    if (audio.state === 'suspended') audio.resume();
    // Play a silent blip so iOS considers audio unlocked.
    const o = audio.createOscillator(); const g = audio.createGain();
    g.gain.value = 0; o.connect(g); g.connect(audio.destination); o.start(); o.stop(audio.currentTime + 0.01);
  } catch { /* no audio */ }
}

export function beep() {
  if (!audio) return;
  const t0 = audio.currentTime;
  [0, 0.25, 0.5].forEach((dt, i) => {
    const o = audio!.createOscillator(); const g = audio!.createGain();
    o.frequency.value = i === 2 ? 1320 : 880;
    g.gain.setValueAtTime(0.0001, t0 + dt);
    g.gain.exponentialRampToValueAtTime(0.5, t0 + dt + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.2);
    o.connect(g); g.connect(audio!.destination);
    o.start(t0 + dt); o.stop(t0 + dt + 0.22);
  });
}

// ---------- notifications ----------
export const notificationsSupported = () => typeof Notification !== 'undefined' && 'serviceWorker' in navigator;

/** Ask for permission — call from a button tap (required on iOS). */
export async function askNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!notificationsSupported()) return 'unsupported';
  return Notification.requestPermission();
}

async function notify(label: string) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification('Rest is over 💪', { body: label ? `Next set: ${label}` : 'Time for your next set', tag: 'rest-timer' });
  } catch { /* ignore */ }
}

// ---------- timer API ----------
export function startTimer(seconds: number, label = '') {
  unlockAudio();
  state = { endAt: Date.now() + seconds * 1000, duration: seconds, label, alerted: false };
  persist();
}
export function addTime(seconds: number) {
  if (!state) return;
  state = { ...state, endAt: Math.max(Date.now(), state.endAt) + seconds * 1000, duration: state.duration + seconds, alerted: false };
  persist();
}
export function stopTimer() { state = null; persist(); }
export const remainingMs = (s: TimerState | null, now = Date.now()) => (s ? s.endAt - now : 0);

function fireIfDue() {
  if (state && !state.alerted && Date.now() >= state.endAt) {
    state = { ...state, alerted: true };
    persist();
    beep();
    navigator.vibrate?.([300, 120, 300, 120, 500]);
    notify(state.label);
  }
}

// One global ticker. When the app comes back to the foreground, check immediately.
setInterval(fireIfDue, 250);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { fireIfDue(); listeners.forEach((l) => l()); } });

/** Hook: re-renders every 250 ms while a timer exists. */
export function useTimer(): { timer: TimerState | null; remaining: number } {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    const id = setInterval(() => state && l(), 250);
    return () => { listeners.delete(l); clearInterval(id); };
  }, []);
  return { timer: state, remaining: remainingMs(state) };
}
