# Cut Tracker — 20-week cut

A personal, offline-first fitness tracker that runs on your phone as an installed web app (PWA).
Workouts, food (with Egyptian/Arab dishes and barcode scanning), cardio & steps, body weight,
calendar, charts and backups. **All your data stays on your phone.** No accounts, no cloud database.

The training program is loaded from [`program.json`](program.json), which is the only place the
program is defined. To change the program, edit that file and redeploy.

---

## Contents
1. [Run it locally](#1-run-it-locally)
2. [Deploy to GitHub Pages](#2-deploy-to-github-pages)
3. [Install on iPhone and Android](#3-install-on-your-phone)
4. [Back up and restore](#4-back-up-and-restore)
5. [Laptop sync server (optional)](#5-laptop-sync-server-optional)
6. [How the app works](#6-how-the-app-works)
7. [Project layout and TypeScript notes](#7-project-layout)
8. [Known limits](#8-known-limits)

---

## 1. Run it locally

Requires **Node.js 20+** (`winget install OpenJS.NodeJS.LTS` on Windows).

```bash
npm install          # once
npm test             # unit tests for all calculations (Vitest)
npm run dev          # http://localhost:5173 on this computer
```

**On your phone (same Wi-Fi):** the camera and service worker need HTTPS, so use

```bash
npm run dev:https    # prints https://192.168.x.x:5173
```

Open that address on the phone and accept the "not private / self-signed certificate" warning.
Everything works for UI testing, but iOS doesn't allow installing a PWA from a self-signed
certificate. To test install and offline mode, use the deployed GitHub Pages build (section 2).

Other scripts:

| Command | What it does |
|---|---|
| `npm run build` | Type-checks and builds the production app into `dist/` |
| `npm run preview` | Serves `dist/` locally (with `--host` so the phone can reach it) |
| `node scripts/smoke.mjs` | Headless iPhone-size browser test of the main flows (needs `npx playwright install chromium` and a running `npx vite preview --port 4173`) |
| `node scripts/offline-check.mjs <url>` | Checks that the app loads and works with no network |
| `python scripts/make_icons.py` | Regenerates the app icons |

## 2. Deploy to GitHub Pages

GitHub Pages gives free HTTPS hosting. HTTPS is required for the camera and for home-screen install.

1. Create an **empty** repo on github.com, e.g. `cut-tracker`. On the free plan it must be
   **public** for Pages to work. Only the app code and `program.json` are published. Your logs,
   1RMs and bodyweight are never in the repo.
2. Push this folder:
   ```bash
   git remote add origin https://github.com/<you>/cut-tracker.git
   git push -u origin main
   ```
3. On GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. Every push to `main` now runs `.github/workflows/deploy.yml`: install → tests → build → deploy.
   Watch it in the **Actions** tab. The app goes live at `https://<you>.github.io/cut-tracker/`.

When you push an update, the app shows **"New version available — Update"** the next time you
open it. It never reloads by itself, so an update can't interrupt a workout.

## 3. Install on your phone

### iPhone (Safari)
1. Open `https://<you>.github.io/cut-tracker/` in **Safari** (not Chrome; on iOS only Safari can install PWAs).
2. Tap **Share** (the square with ↑) → scroll → **Add to Home Screen** → **Add**.
3. **Always open it from the home-screen icon.** iOS keeps an installed app's storage far more
   reliably than a normal Safari tab, and the app runs full-screen.
4. On the Today screen, tap **Enable** on "Get a notification when rest is over?". This needs iOS 16.4+
   and must be done from inside the installed app.

### Android (Chrome)
Open the URL in Chrome → **⋮ → Install app** (or tap the **Install app** button in *More*).

After the first launch the app works with **no internet at all**, for example at the gym.
Only Open Food Facts lookups need a connection.

## 4. Back up and restore

Your data lives in the phone's browser storage (IndexedDB). The app asks the browser to protect
it (`navigator.storage.persist()`), but **treat the phone as able to lose data**: deleting the app,
"Clear website data", or iOS storage cleanup will erase it.

- **Export backup:** *More → Backup & sync → Export backup (JSON)*. On iPhone the share sheet
  opens: choose **Save to Files → iCloud Drive**. That's two taps. The app reminds you if the
  last backup is more than 7 days old.
- **Restore:** *Import backup file* and pick the JSON.
  - **Merge (keep newer):** for each record, keeps whichever version was changed last. This is safe to repeat.
  - **Replace all:** wipes the phone's data first, then loads the backup.
- **CSV export:** workouts (one row per set), food log, and weight/waist/steps, for Excel or
  Google Sheets. Arabic text displays correctly.

Moving to a new phone: export on the old phone, install the app on the new one, finish Setup
with any values, then *Import → Replace all*.

## 5. Laptop sync server (optional)

A small Python server in `server/` that you run at home. When the phone can reach it on your
Wi-Fi, the app sends its changes automatically: on open, when you come back to the app, every
15 minutes, and after each workout. Conflicts are resolved per record by `updatedAt`
(last write wins). The server keeps the **last 14 daily backups** in `server/data/backups/`,
in the same format as *Export backup*, so any of them can be imported into the app.
The app works the same without the server.

### One-time setup

```bash
cd server
python -m venv .venv
.venv\Scripts\activate            # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
```

**HTTPS certificate.** The app is served over HTTPS, and browsers block HTTPS pages from
calling plain-HTTP addresses. So the server needs a certificate the phone trusts. Use
[mkcert](https://github.com/FiloSottile/mkcert) (`winget install FiloSottile.mkcert`):

```bash
mkcert -install                                   # creates a local certificate authority
mkdir certs
mkcert -cert-file certs/cert.pem -key-file certs/key.pem 192.168.1.20 localhost
#                                                         ^ your laptop's Wi-Fi IP (ipconfig)
mkcert -CAROOT                                    # shows the folder containing rootCA.pem
```

Install the root CA on the phone (only once):
- **iPhone:** AirDrop or email `rootCA.pem` to the phone → open it → *Settings → Profile Downloaded → Install*.
  Then **Settings → General → About → Certificate Trust Settings → turn on full trust** for "mkcert".
- **Android:** *Settings → Security → Encryption & credentials → Install a certificate → CA certificate* → pick `rootCA.pem`.

Keep `rootCA-key.pem` private and never copy it anywhere. Give your laptop a fixed IP in your
router (DHCP reservation) so the certificate stays valid.

### Run it

```bash
cd server
.venv\Scripts\activate
python run.py
```

It prints the **Server URL** (e.g. `https://192.168.1.20:8765`) and a **Sync token**
(stored in `server/data/token.txt`). In the app: *More → Backup & sync → Laptop sync*, paste
both, tap **Save & sync now**. If it fails, open the server URL once in Safari; you should see
`{"ok":true,...}`. If you don't, the certificate isn't trusted yet. Windows Firewall may ask
to allow Python on private networks; allow it.

Server tests: `python -m pytest server -q`.

## 6. How the app works

**Which workout is next.** The order rolls (Upper A → Lower A → Upper B → Lower B) and isn't
tied to weekdays. A week counts as done when all 4 sessions are done, so a 3-day week just
carries over. Use **Change** on Today to open any week or day; past sessions open for editing.

**The program week drives everything.** The header "Week X of 20" is the week of your next
workout. Calorie targets (cut or maintenance) and cardio targets follow it, so the
maintenance calories in weeks 9–10 and 19–20 line up with the deload and test sessions.
Weekly averages (weight, steps, calories) use 7-day blocks counted from your start date.

**Loads.** Primary lifts show `round(1RM × %1RM / 2.5) × 2.5`. Weeks 11–20 use the 1RM from the
Week 10 AMRAP: enter your reps on the AMRAP set and tap *Apply*, which uses Epley
`load × (1 + reps/30)` rounded to 2.5 kg. **Overhead Press has no AMRAP** in the program, so it
keeps its current 1RM unless you edit "1RMs for weeks 11–20" in Settings.

**Coaching rules** (from `program.json → rules`). These are the exact interpretations, all in
`src/core/rules.ts`:
- *Progression (accessories):* every set reached the top of the rep range, and the last-set RPE
  you entered is at or below the upper end of the target (e.g. "~8-9" → 9) → "+2.5 kg";
  otherwise "+1 rep". If you didn't enter an RPE, that doesn't block the +2.5 kg suggestion.
- *Recovery rule:* "performance dropped two sessions in a row" means the best estimated 1RM
  (Epley) for that exercise went down in each of the last two sessions. The app suggests removing
  one set from each accessory (never the primary), and there's a button to do it.
- *Late-cut rule (weeks 15–18):* a ticked **[Top set]** with fewer reps than the bottom of its
  range → suggests skipping that lift's back-off sets.

**Nutrition.** Maintenance = bodyweight × 31 (or your override); cut = maintenance − 450;
protein 2.0 g/kg, fat 0.8 g/kg, carbs = the remainder. These numbers are read from
`program.json → nutrition`. At Week 11 the app prompts you to recalculate with your 7-day
average weight. The weekly check-in applies `adjust_rules` only during cut weeks, and offers
buttons to apply −150 kcal, +2,000 steps, or +100/150 kcal.

**Colours.** Calories: green within ±100 kcal, amber within ±250, red beyond. Protein: green at
≥95 % of target. Carbs and fat: green within ±15 %. While today is still in progress, being under
target shows as neutral blue. The tolerances are in `src/core/nutrition.ts` (`TOLERANCE`).

**Food search order.** 1) your local foods (offline, includes about 140 Egyptian seed foods;
search handles spellings like koshary/koshari/كشري, foul/ful/فول, ta'meya/taameya/طعمية);
2) Open Food Facts (online, Egypt products first); 3) a manual form prefilled with the barcode.
Every Open Food Facts product you use is saved on the phone so it works offline next time.
Seed foods are **estimates** (marked "est."), so edit any of them to your own values.

**Rest timer.** It stores the **end time**, not a countdown, so it's still correct after the
screen locks. When rest ends you get a sound, vibration (Android), a notification if you enabled
it, and an on-screen "Rest over!".

## 7. Project layout

```
program.json              ← your program (single source of truth)
foods_seed_eg.json        ← 143 Egyptian/Arab foods, estimates per 100 g + servings
src/core/                 ← PURE calculation code (no DOM, no database) + *.test.ts
  loads.ts   target load, Epley, rep/RPE/rest parsing
  schedule.ts  next workout, week completion, program week on a date
  nutrition.ts targets, colours, adjust rules, recipe macros
  rules.ts   progression, recovery, late-cut, AMRAP
  cardio.ts  weekly cardio targets & warnings
  search.ts  Arabic/English spelling-tolerant food search
  daily.ts   calendar ticks, weekly check-in rows
  stats.ts   moving averages, streaks, volume
  backup.ts  backup format, last-write-wins merge, CSV
  off.ts     Open Food Facts product → food conversion
src/db/                   ← IndexedDB schema (Dexie) and save/remove helpers
src/lib/                  ← app state, router, rest timer, sync, backup, Open Food Facts calls
src/screens/              ← one file per screen
src/sw.ts                 ← service worker (offline cache, notification taps)
server/                   ← optional FastAPI sync server + tests
```

**TypeScript notes for a Python/Java developer**
- `interface Foo { a: number }` describes the shape of an object, like a Java interface with
  only fields. It disappears at runtime.
- `async`/`await` works like Python's asyncio. Every database call returns a Promise
  (similar to a Future) that you `await`.
- `a ?? b` means "a, unless it's null/undefined, then b". `a?.b` means "a.b, or undefined if a is null".
- Screens are **Preact** function components. `useState` keeps a value between renders, and
  `useLiveQuery` (Dexie) re-runs a database query and re-renders whenever the data changes.
  That's why the UI updates by itself after every save.
- Every database write goes through `save()` / `remove()` in `src/db/repo.ts`. They stamp
  `updatedAt`, which sync and import rely on. Deletes are "soft" (`deleted: true`) so other
  devices learn about them.

## 8. Known limits

- **iPhone rest-timer notification.** iOS pauses web apps when the screen locks and has no API
  to schedule a local notification. A true push would need a cloud push server, which this
  project rules out. So with the phone locked, the notification only appears if iOS lets the app
  run; otherwise you get the alert and sound as soon as you unlock. The time shown is always
  correct because the timer stores the end time. The iPhone has no vibration API.
- **Open Food Facts text search** comes from a crowd-sourced service that is currently moving
  its search API. The new search service doesn't allow calls from other websites yet, and the
  classic one was returning errors when this was built. The app tries both, then falls back to a
  brand search. **Barcode lookups work reliably.** If a product isn't found, the label form
  takes about 20 seconds and is saved forever.
- Seed food values are typical estimates. Home recipes and restaurant portions vary a lot, so
  use the recipe builder for dishes you eat often.
