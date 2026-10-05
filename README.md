# QuestBound

A campaign companion app for Dungeons & Dragons and Pathfinder 1e. The GM runs the world — maps, fog of war, secrets — and players run their characters, all in one shared space.

## Features

- **Accounts & roles** — sign up and log in; every campaign has a GM and any number of players.
- **Campaign sharing** — each campaign gets a unique invite code, so players can join without the GM doing admin work.
- **Characters** — multiple characters per player per campaign, with PF1e ability scores, classes, skills, and portraits.
- **Battle map** — grid map with draggable tokens and GM-only fog of war. Players can't see or touch the fog, and their view updates live as the GM moves things.
- **World map** — upload a world image, drop pins, and connect regions in a node graph.
- **Wiki** — campaign notes with GM-only pages that stay hidden from players.
- **Obsidian import** — parse notes from an Obsidian vault straight into the campaign wiki.

## Tech stack

Next.js (App Router) · Prisma + PostgreSQL · NextAuth · Tailwind CSS · S3-compatible storage for uploads

## Run it yourself

Prerequisites: Node 20+, PostgreSQL.

```bash
cd nextjs_space
npm install

# .env — the only required values to start:
#   DATABASE_URL="postgresql://user:password@localhost:5432/questbound"
#   NEXTAUTH_SECRET="<any long random string>"
#   AUTH_SECRET="<any long random string>"
# S3 vars (AWS_*) are optional; portrait/attachment uploads are skipped without them.

npx prisma generate
npx prisma db push
npm run build
npm start
```

The app serves on `http://localhost:3000`. Put it behind a Cloudflare Tunnel (or any reverse proxy) to share it with your table.

## Project layout

```
nextjs_space/
├── app/                    # Routes: dashboard, campaign pages, API
│   ├── api/                # REST endpoints (campaigns, characters, maps, wiki, auth)
│   └── campaign/[id]/      # Campaign shell + tabs (battle map, world map, wiki, players)
├── components/             # UI components
├── lib/                    # pf1e-skills, Prisma client, S3, campaign helpers, Obsidian parser
└── prisma/                 # Database schema
```

## Status

In active development. The core loop — accounts → campaign → invite code → characters → battle map — is working and being playtested. Built with Abacus AI, now maintained by hand.
