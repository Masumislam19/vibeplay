# VibePlay — Video Streaming Platform (Supabase Storage + MongoDB Atlas)

VibePlay is a complete, Free-plan-friendly video streaming platform built with
**Next.js 16 + React + TypeScript + Tailwind CSS**, using **MongoDB Atlas** as
the primary application database and **Supabase Storage** (`vibeplay-media`) as
the ONLY video and thumbnail storage provider. Videos play directly inside
VibePlay using a custom **native HTML5 `<video>` player** — zero external
embeds, zero iframes, zero redirects, and zero Docker required.

---

## 1. Architecture & Stack

| Layer | Technology |
| --- | --- |
| UI & Player | React 19 + TypeScript (strict), Tailwind CSS 4, Lucide icons, custom native HTML5 `<video>` player (`src/components/player/vibeplay-player.tsx`) |
| Framework / Runtime | Universal **Next.js 16 App Router** + **Node.js 20+** (runs natively on Render, Railway, Vercel, Netlify, or any Node.js VPS — no Docker required) |
| Primary Database | **MongoDB Atlas M0 Free** via the official `mongodb` driver (videos & metadata, upload sessions, categories, views, reports, settings, single-owner auth, sessions, audit logs, durable rate limits) |
| Media Storage | **Supabase Storage Free** (`vibeplay-media` public bucket) for original MP4 videos and auto-generated WebP/JPEG thumbnails |
| Upload Protocol | Server-authorized **signed resumable TUS uploads** (`tus-js-client`, 6 MiB chunks, direct `.storage.supabase.co/storage/v1/upload/resumable/sign` endpoint, `x-signature` + `apikey`) |

- **Zero obsolete providers:** All previous third-party video host integrations have been removed from runtime code. No PostgreSQL, Drizzle, Firebase, Cloudinary, Mux, or Cloudflare R2 dependencies exist.
- **Data protection for legacy records:** Existing MongoDB video records from prior setups are **never deleted**. Any unmigrated record is displayed as **Legacy (Unmigrated)** in Admin → Videos with a **Replace File** button that uploads a local MP4 to Supabase Storage and updates the exact same MongoDB record in place while preserving its title, description, category, views, and metadata.

---

## 2. Project Structure

```
src/
  app/
    api/
      admin/
        uploads/authorize/  # Validates MP4/quota & mints short-lived Supabase signed upload tokens
        uploads/complete/   # Verifies uploaded Supabase object & saves/updates MongoDB record atomically
        videos/             # Admin list, edit, publish, delete (removes Supabase objects + MongoDB record)
        setup/, login/, logout/, me/, recovery/, sessions/, categories/, reports/, settings/, stats/
      videos/               # Public catalog, watch details, related, thumbnail, view tracking, reports
      categories/, settings/, health/
    admin/                  # Single-owner private dashboard (Overview, Videos, Upload, Categories, Reports, Settings)
    watch/[id]/             # Public Watch page with native VibePlay HTML5 player
    explore/, trending/, latest/, categories/, category/[slug]/, legal/
  components/
    player/vibeplay-player.tsx   # Custom native HTML5 <video> player (Play/Pause, Seek, Volume, Speed, Fullscreen, Autoplay fallback)
    admin/import-manager.tsx     # Direct PC & mobile gallery MP4 uploader (signed TUS + auto Canvas thumbnail)
    admin/video-manager.tsx      # Video catalog management + inline preview + legacy replacement + delete
    admin/dashboard-overview.tsx # Real MongoDB metrics + Supabase Free-plan storage usage monitor
  db/
    mongodb.ts              # Cached MongoClient connection pool + ping + honest errors
    collections.ts          # Typed collections (videos, upload_sessions, categories, admins, rate_limits, etc.) + indexes
  lib/
    supabase-tus-upload.ts  # Signed TUS resumable browser uploader (6 MiB chunks, retries, resume, cancel)
    video-thumbnail.ts      # Automatic Canvas frame extraction (skips black frames, max 1280px, WebP/JPEG < 500 KB)
  server/
    services/
      supabase-storage.ts         # Server-only Supabase SDK (SUPABASE_SECRET_KEY never leaves server)
      supabase-storage-utils.ts   # Pure URL builders, path validators, 50 MB / 1 GB quota rules
      videos.ts, auth.ts, settings.ts, stats.ts
scripts/
  seed.mjs                  # Idempotent MongoDB index creation + starter categories
  test-supabase-storage.ts  # Unit + mock TUS resumable + HTTP 206 byte-range test suite
  test-mongodb-auth.ts      # Single-owner auth & MongoDB runtime checks
```

---

## 3. Environment Variables

Configure these environment variables locally (`.env.local` or `.env`) or in your host's Environment Variables dashboard:

```env
MONGODB_URI=
MONGODB_DB_NAME=vibeplay
ADMIN_SETUP_KEY=
NEXT_PUBLIC_SUPABASE_URL=https://qgmeydlcvyggavtftmyz.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
SUPABASE_BUCKET=vibeplay-media
SITE_URL=
SUPABASE_MAX_STORAGE_MB=950
```

### Security Notes
- **`SUPABASE_SECRET_KEY` is strictly server-only.** Never prefix it with `NEXT_PUBLIC_`, never commit it to Git, and never expose it to browser code. It is used solely on the server to mint short-lived signed upload tokens (`createSignedUploadUrl`), verify uploaded objects, and delete objects when the owner deletes a video.
- **`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`** is safe for browser use as the gateway `apikey` header alongside the server-minted `x-signature` token.
- **Public bucket notice:** `vibeplay-media` is public for reading videos and thumbnails so visitors can stream MP4s directly. **Draft object paths are never exposed** in public pages or public API responses, and visitors cannot upload or delete objects without server-signed admin authorization.
- **Single-owner admin (`markket287@gmail.com`):** Enforced server-side across `/admin/setup`, `/admin/login`, session validation, `/api/admin/recovery`, and every protected `/api/admin/**` route. Passwords are hashed with salted Node.js `scrypt`, sessions use hashed opaque tokens stored in MongoDB with TTL cleanup, and rate limits are persisted atomically in MongoDB.

---

## 4. Supabase Storage Free Plan Limits & Best Practices

Supabase Free limits respected by VibePlay:
- **50 MB maximum per file:** Enforced both in the browser and on the server. Files over 50 MB are rejected cleanly before upload starts with a local compression recommendation (this global Free-plan limit cannot be bypassed by disabling bucket-level limits).
- **1 GB total storage:** Tracked in MongoDB across all Supabase-hosted videos & thumbnails, with a visual **800 MB warning** and a **950 MB safe upload stop** (`SUPABASE_MAX_STORAGE_MB`) so you never accidentally overrun Free storage.
- **5 GB monthly egress:** Displayed in Admin Overview as a usage reminder.
- **Project inactivity pause:** Supabase Free projects pause after extended inactivity. If a video fails to load, open your Supabase Dashboard (`vibeplay-media`) to confirm the project is active (unpaused).
- **MP4 format (no server transcoding):** Supabase Storage stores files as-is (it does not transcode to HLS/DASH or multiple resolutions). Upload browser-compatible **MP4 (H.264 video + AAC audio)**. To compress larger videos locally for free:
  - **HandBrake (GUI):** Choose the *Fast 720p30* or *Fast 1080p30* preset with *Web Optimized* checked.
  - **FFmpeg (CLI):** `ffmpeg -i input.mp4 -c:v libx264 -crf 24 -c:a aac -movflags +faststart output.mp4`

### Recommended Supabase Storage Policies (`vibeplay-media`)
Because uploads and deletes are authorized server-side with `SUPABASE_SECRET_KEY` (via signed upload tokens and authenticated admin delete routes):
- Keep the bucket **Public** for `SELECT` / public object reads.
- Do **NOT** create open anonymous `INSERT`, `UPDATE`, or `DELETE` policies on `storage.objects`.

---

## 5. Direct PC & Mobile Upload + Automatic Thumbnails

1. Open **Admin → Upload** (`/admin/import`).
2. Tap **Select Video** (or drag-and-drop on desktop). Uses `accept="video/mp4"` without camera capture so Android and iPhone open your existing media gallery.
3. VibePlay displays the filename, size, duration, resolution, live `<video>` preview, and **automatically extracts a thumbnail** from a non-black video frame via `<canvas>` (max width 1280px, compressed WebP/JPEG under 500 KB). Click **Regenerate Thumbnail** to sample a different timestamp before uploading.
4. Click **Upload Video**:
   - VibePlay validates the MP4, quota, and owner session, then mints short-lived signed upload tokens for random collision-resistant paths (`videos/{videoId}/{randomId}.mp4` and `thumbnails/{videoId}/{randomId}.webp`).
   - Your browser uploads directly to `https://qgmeydlcvyggavtftmyz.storage.supabase.co/storage/v1/upload/resumable/sign` in **6 MiB TUS chunks** with real byte progress, retry/resume on network hiccups, and working **Cancel** / **Retry** controls.
   - VibePlay verifies the uploaded object exists (and checks HTTP `206` byte-range seeking support) and saves the final metadata in MongoDB Atlas.

---

## 6. Local Development (VS Code — No Docker Required)

1. Extract `VibePlay-Source.zip` and open the folder in VS Code.
2. Install exact dependencies:
   ```bash
   npm ci
   ```
3. Copy `.env.example` to `.env.local` and fill in your real values.
4. Initialize MongoDB indexes & starter categories:
   ```bash
   node scripts/seed.mjs
   ```
5. Start the dev server:
   ```bash
   npm run dev
   ```
6. Visit `http://localhost:3000/admin/setup` with `ADMIN_SETUP_KEY` and `markket287@gmail.com` to create the owner account.

---

## 7. Deployment Guides (No Docker Required)

Push your extracted source manually to **your own** GitHub repository (never commit `.env` or `.env.local`):

```bash
git init
git add .
git commit -m "VibePlay — Supabase Storage + MongoDB Atlas"
git remote add origin https://github.com/<you>/vibeplay.git
git branch -M main
git push -u origin main
```

Set all environment variables from Section 3 on your chosen host:

- **Render (Node.js Web Service):** Runtime Node 20+, Build `npm ci && npm run build`, Start `npm run start`.
- **Railway (Node.js Service):** Build `npm ci && npm run build`, Start `npm run start`.
- **Vercel:** Framework Next.js, Install `npm ci`, Build `npm run build`. (Direct browser-to-Supabase TUS uploads bypass Vercel's serverless body limits cleanly.)
- **Netlify:** Uses `netlify.toml` (`publish = ".next"`, `command = "npm run build"`, automatic OpenNext adapter). Direct browser-to-Supabase TUS uploads bypass Netlify Function body limits cleanly.
- **Generic Node.js VPS:** `npm ci && npm run build`, run `PORT=3000 npm run start` under `pm2`/`systemd`, reverse-proxy HTTPS with Nginx or Caddy.

---

## 8. Verification Commands

```bash
npm ci
node --experimental-strip-types scripts/test-supabase-storage.ts
node --experimental-strip-types scripts/test-mongodb-auth.ts
npx next typegen
npm exec tsc -- --noEmit --pretty false
npm run lint
npm run build
```
