# Rally365 — Supabase Connected MVP

Rally365 is a mobile-first shared badminton app for everyday ad-hoc doubles.

## What this version does

- Loads Rally365 Court players from Supabase
- Loads match history from Supabase
- Creates arbitrary 2-vs-2 teams
- Saves match scores to `matches`
- Saves team membership to `match_players`
- Calculates player W/L/Win% from stored matches
- Subscribes to Supabase Realtime for shared updates

## 1. Install

```bash
npm install
```

## 2. Environment

Create `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://oqytlisvxlfdbgclfevj.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

Do not commit `.env.local`.

## 3. Run

```bash
npm run dev
```

Open http://localhost:3000

## 4. Build

```bash
npm run build
npm start
```

## 5. Push to GitHub

```bash
git add .
git commit -m "Connect Rally365 to Supabase"
git push origin main
```

Then Vercel will deploy the new version if Git integration is enabled.

## Vercel environment variables

Add these in the Rally365 Vercel project:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Enable them for Production, Preview, and Development.

The Supabase database schema must already exist. This source expects:

- `groups`
- `players`
- `matches`
- `match_players`

with the schema created for Rally365 Court.
