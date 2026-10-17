// Floating rest-timer bar, visible on every screen while a timer runs.
import { fmtClock } from '../core/format';
import { addTime, stopTimer, useTimer } from '../lib/timer';

export function RestTimerBar() {
  const { timer, remaining } = useTimer();
  if (!timer) return null;
  const finished = remaining <= 0;
  const overdue = Math.round(-remaining / 1000);
  return (
    <div class={`timer ${finished ? 'finished' : ''}`} role="timer" aria-live="polite">
      <div class="time">{finished ? '0:00' : fmtClock(remaining / 1000)}</div>
      <div class="grow small">
        {finished ? <b>Rest over! {overdue > 5 ? <span class="muted">({fmtClock(overdue)} ago)</span> : null}</b> : <span class="muted">Rest</span>}
        {timer.label && <div class="muted name">{timer.label}</div>}
      </div>
      {!finished && <button class="small" onClick={() => addTime(-15)}>−15</button>}
      {!finished && <button class="small" onClick={() => addTime(30)}>+30</button>}
      <button class="small" onClick={stopTimer} aria-label="Close timer">{finished ? 'OK' : '✕'}</button>
    </div>
  );
}
