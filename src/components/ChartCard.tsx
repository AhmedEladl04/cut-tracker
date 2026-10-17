// A card with one Chart.js chart plus a "table" toggle (so numbers are readable without colour).
// Chart.js is imported lazily the first time a chart is shown, so the app opens fast;
// the service worker still caches it for offline use.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { ChartConfiguration } from 'chart.js';

// Validated categorical colours for the dark surface (blue, orange, aqua, yellow).
export const SERIES = ['#3987e5', '#d95926', '#199e70', '#c98500'];
export const INK = { grid: '#2c3442', muted: '#8d97a8', text: '#e8ecf1', surface: '#171b22' };

export function ChartCard(props: {
  title: string;
  subtitle?: string;
  config: ChartConfiguration;
  table: { headers: string[]; rows: (string | number)[][] };
  empty?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    if (props.empty || showTable || !canvas.current) return;
    let chart: { destroy: () => void } | null = null;
    let cancelled = false;
    import('chart.js/auto').then(({ Chart }) => {
      if (cancelled || !canvas.current) return;
      Chart.defaults.color = INK.muted;
      Chart.defaults.font.size = 12;
      chart = new Chart(canvas.current, props.config);
    });
    return () => { cancelled = true; chart?.destroy(); };
  }, [props.config, showTable, props.empty]);

  return (
    <section class="card">
      <div class="row between">
        <div><h3>{props.title}</h3>{props.subtitle && <div class="small muted">{props.subtitle}</div>}</div>
        {!props.empty && <button class="ghost small" onClick={() => setShowTable(!showTable)}>{showTable ? 'Chart' : 'Table'}</button>}
      </div>
      {props.empty ? <p class="small muted">Not enough data yet.</p> : showTable ? (
        <div style={{ maxHeight: 260, overflowY: 'auto' }}>
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <thead><tr>{props.table.headers.map((h) => <th key={h} class="right muted">{h}</th>)}</tr></thead>
            <tbody>{props.table.rows.map((r, i) => <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>{r.map((c, j) => <td key={j} class="right">{c}</td>)}</tr>)}</tbody>
          </table>
        </div>
      ) : (
        <div style={{ position: 'relative', height: 220, marginTop: 8 }}><canvas ref={canvas} /></div>
      )}
    </section>
  );
}

/** Shared Chart.js options: thin marks, recessive grid, index tooltip (hover/tap shows all series). */
export function baseOptions(yTitle: string, legend: boolean) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false as const,
    interaction: { mode: 'index' as const, intersect: false },
    plugins: {
      legend: { display: legend, labels: { color: INK.text, boxWidth: 12, boxHeight: 2 } },
      tooltip: { backgroundColor: '#212733', titleColor: INK.text, bodyColor: INK.text, borderColor: INK.grid, borderWidth: 1 },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: INK.muted, maxRotation: 0, autoSkip: true, maxTicksLimit: 7 } },
      y: { grid: { color: INK.grid }, border: { display: false }, ticks: { color: INK.muted }, title: { display: true, text: yTitle, color: INK.muted } },
    },
  };
}
