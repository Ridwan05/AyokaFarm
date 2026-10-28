# AyokaFarm

A web app for running AyokaFarm's poultry operation: daily pen production, feed and medication stock, sales, purchases, expenses, payments, customer and supplier balances, and reports. The requirements are in [AyokaFarm_BRD.md](AyokaFarm_BRD.md).

It's one responsive web app for everyone — on a PC in the office or a phone in the pen. The front end still runs on mock data held in memory (`frontend/src/data/`), so changes reset on reload; the Supabase backend is being built alongside it.

## Repository layout

```
frontend/   the Next.js web app
backend/    Supabase: database migrations and config (supabase/)
```

## Run the web app

```sh
cd frontend
npm install
npm run dev      # http://localhost:3000
npm run build    # type-check and production build
npm run lint
```

## Backend (Supabase)

Migrations live in `backend/supabase/migrations/`. Run Supabase CLI commands from `backend/`:

```sh
cd backend
npx supabase migration new <name>
```

Use the person at the bottom of the sidebar (or in the ☰ menu on a phone) to view the app as each role.

| Role | Starts on | Can use |
|---|---|---|
| Owner · Admin | Dashboard | Everything |
| Farm Manager | Dashboard | Operations, trade, reports; Settings → Staff only |
| Sales & Accounts | Accounts home | Sales, purchases, expenses, payments, customers, suppliers, reports |
| Store Keeper | Store today | Receiving deliveries, the weekly count, stock pages |
| Pen Attendant | My pens | Daily entries and expenses for their own pens; stock pages read-only |

## Stack

Next.js (App Router) · React 19 · TypeScript · Tailwind CSS v4 · [Sonner](https://sonner.emilkowal.ski) toasts · [Vaul](https://vaul.emilkowal.ski) drawers · lucide icons.

Inside `frontend/`:

```
src/app/          routes — each page.tsx renders a screen
src/screens/      one component per page
src/features/     modals and drawers for each area
src/components/   layout and the UI kit (ui/)
src/data/         mock data and the in-memory store (swap for API calls)
src/lib/          access rules, formatting, small hooks
```

Motion follows a few rules, defined as tokens in `frontend/src/app/globals.css`: strong ease-out curves, UI animations under 300ms, transform and opacity only, no animation on things people do dozens of times a day, and reduced-motion respected.
