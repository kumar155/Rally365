# Rally365

Rally365 is a mobile-first badminton group app for everyday ad-hoc doubles matches.

## MVP included

- Today's match dashboard
- Create arbitrary 2-vs-2 teams
- Quick score recording
- Match history
- Player leaderboard
- Wins, losses, win rate and points
- Mobile-first responsive UI
- PWA-ready Next.js structure

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000

## Next production step

Connect the UI to Supabase for:
- shared group membership
- authentication
- PostgreSQL match storage
- realtime synchronization
- offline sync

Then deploy to Vercel.

## GitHub

```bash
git init
git branch -M main
git add .
git commit -m "Initial Rally365 MVP"
git remote add origin https://github.com/kumar155/Rally365.git
git push -u origin main
```