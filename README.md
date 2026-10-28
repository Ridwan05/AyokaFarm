# AyokaFarm

A web app for running AyokaFarm's poultry operation: daily pen production, feed and medication stock, sales, purchases, expenses, payments, customer and supplier balances, and reports. The requirements are in [AyokaFarm_BRD.md](AyokaFarm_BRD.md).

It's one responsive web app for everyone — on a PC in the office or a phone in the pen. Staff sign in with their phone number and a password; the farm's records live in Supabase, protected by row-level security. Dashboards, charts and most reports still show sample figures (marked "Sample figures") until round 2.

## Repository layout

```
frontend/   the Next.js web app
backend/    Supabase: database migrations and config (supabase/), setup scripts (scripts/)
```

## Environment variables

Copy `frontend/.env.example` to `frontend/.env.local` (git ignores it) and fill it in. On Vercel, set the same names under Settings → Environment Variables.

| Name | Where to find it | Secret? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API | No |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → API Keys (`sb_publishable_…`) | No — row-level security protects the data |
| `SUPABASE_SECRET_KEY` | Supabase → API Keys → Secret keys (`sb_secret_…`) | **Yes** — server only; mark it Sensitive on Vercel, never prefix with `NEXT_PUBLIC_` |

## First-time setup

```sh
cd frontend && npm install && cd ..
node backend/scripts/setup.mjs          # creates the Owner (asks for name, phone, password)
node backend/scripts/setup.mjs --demo   # optional: demo staff, pens, flocks and a week of records
node backend/scripts/remove-demo.mjs    # before go-live: deletes all farm records and demo staff
```

The Owner then adds everyone else in Settings → Staff. Public sign-up is turned off in Supabase (Authentication → Sign In / Providers → "Allow new users to sign up").

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

Each person sees only what their role allows:

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
