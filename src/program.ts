// The ONE place program.json is loaded. It's bundled into the app at build time
// (Vite turns the JSON import into a JS object), so it is available offline from first launch.
import programJson from '../program.json';
import type { Program } from './core/types';

export const program = programJson as unknown as Program;
export const TOTAL_WEEKS = program.weeks.length;
