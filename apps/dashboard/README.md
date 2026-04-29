# BetterBugs Dashboard

Next.js 14 web dashboard for browsing, replaying, and analyzing captured bug sessions.

## Stack

- Next.js 14.2.28 (App Router)
- React 18.3
- TypeScript 5.7
- Tailwind CSS 3.4
- Lucide icons + date-fns

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Dashboard runs on `http://localhost:3002`.

## Environment

| Variable | Default | Description |
|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:3001/api/v1` | BetterBugs API base URL |
| `NEXT_PUBLIC_PROJECT_KEY` | `dev-key` | Project API key for the `X-Project-Key` header |

## Scripts

```bash
npm run dev         # Dev server on :3002
npm run build       # Production build
npm run start       # Run production build
npm run typecheck   # TypeScript check (no emit)
```

## Structure

```
apps/dashboard/
├── app/
│   ├── layout.tsx          # Root layout, header, dark mode
│   ├── page.tsx            # Sessions list
│   ├── globals.css         # Tailwind + theme variables
│   └── sessions/[id]/
│       └── page.tsx        # Session detail (tabs, sidebar)
├── components/
│   ├── ui/                 # Button, Card, Badge, Skeleton
│   ├── session-list/       # SessionCard, FilterBar, Skeletons
│   └── session-detail/     # ConsolePanel, NetworkPanel, AiPanel
├── lib/
│   ├── api.ts              # API client (typed)
│   └── utils.ts            # cn() helper
├── tailwind.config.ts
├── postcss.config.mjs
├── next.config.mjs
└── package.json
```
