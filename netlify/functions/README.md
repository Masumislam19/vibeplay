# Serverless / Route Handler Functions

VibePlay does **not** maintain a duplicated set of hand-written Netlify
Functions. Every Next.js App Router route handler under `src/app/api/**`
runs natively on standard Node.js hosts (Render, Railway, VPS) and is
automatically compiled into serverless functions on Vercel or Netlify's
managed OpenNext adapter (`netlify.toml`).

All backend functions connect to **MongoDB Atlas** (`MONGODB_URI` +
`MONGODB_DB_NAME=vibeplay`) and use **Supabase Storage** (`SUPABASE_SECRET_KEY`
server-only) exclusively to mint short-lived signed upload tokens, verify
completed objects, and delete objects on admin actions. Because video binaries
upload directly from the browser to Supabase Storage via signed TUS resumable
uploads, large MP4 files never pass through serverless API request bodies.

## Endpoints

| Route | Purpose |
| --- | --- |
| `src/app/api/videos` | Public catalog: search, filters, sorting, pagination |
| `src/app/api/videos/[id]` | Public video details (published Supabase videos only) |
| `src/app/api/videos/[id]/related` | Related videos |
| `src/app/api/videos/[id]/thumbnail` | Safe thumbnail redirect/serving (never exposes drafts) |
| `src/app/api/videos/[id]/view` | Local view tracking (MongoDB rate limited + hashed dedupe) |
| `src/app/api/videos/[id]/report` | Public content reports (MongoDB rate limited) |
| `src/app/api/categories` | Public categories with published video counts |
| `src/app/api/settings` | Public site settings |
| `src/app/api/health` | Health + MongoDB Atlas ping |
| `src/app/api/admin/setup` | Atomic one-time owner setup (`markket287@gmail.com` + `ADMIN_SETUP_KEY`) |
| `src/app/api/admin/login` | Single-owner login (`markket287@gmail.com` + scrypt password) |
| `src/app/api/admin/recovery` | Owner-only password recovery instructions |
| `src/app/api/admin/uploads/authorize` | Validates MP4 + quota & mints signed Supabase upload tokens |
| `src/app/api/admin/uploads/complete` | Verifies uploaded Supabase object & atomically saves/updates MongoDB record |
| `src/app/api/admin/**` | Stats, video management, categories, reports, settings, session revoke |

`SUPABASE_SECRET_KEY` stays strictly server-side and never enters browser code.
