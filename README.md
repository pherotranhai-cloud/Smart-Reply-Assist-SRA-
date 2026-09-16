# Smart Reply Assist (SRA)

Cyberpunk-themed AI assistant for translation and message composition.

## Features

- **AI Translation:** Multi-language support with vocabulary integration.
- **Smart Composition:** Generate replies based on context, audience, and tone.
- **Vocabulary Library:** Manage custom terms and meanings.
- **Cyberpunk UI:** High-contrast, neon-themed interface.
- **Admin Dashboard:** Lightweight operational view of the three metrics below.

## Admin Dashboard

The dashboard is opened by typing the admin key into the "Góp ý & Báo lỗi" feedback box in
Settings. The key is checked by the server, not the browser: the client offers it to
`GET /api/admin/metrics` as an `x-admin-key` header and opens the dashboard only on a 200.

`/api/admin/*` requires that header and is **fail-closed** — with `ADMIN_API_KEY` unset, every
request is rejected, so the dashboard will not work until the variable is set on each host that
serves the API (Render and Netlify). The guard lives in `shared/adminAuth.ts` and both hosts
mount it.

This replaces an earlier arrangement where the key was compared in the browser against
`VITE_ADMIN_SECRET_KEY`. `VITE_`-prefixed variables are compiled into the bundle, so that secret
shipped to every visitor while the admin routes themselves accepted anyone who knew the URL.
Delete `VITE_ADMIN_SECRET_KEY` from your deployment environments and choose a new value for
`ADMIN_API_KEY` — any value the old variable held should be treated as public.

It tracks exactly three metrics:

- **Online users:** Live count of active sessions. Each open tab posts a heartbeat to
  `POST /api/presence/ping` every 30 seconds (paused while the tab is hidden); the server keeps
  those sessions in memory and expires the stale ones.
- **Total requests:** Cumulative number of logged AI requests (translate, OCR translate, compose).
- **50 most recent responses:** The latest 50 request/response rows loaded from Supabase.

Visit statistics, the user-feedback list, global device management and the admin ban flow have
been removed — no device data is read from or written to Supabase.

## Development

### Run Development Server
```bash
npm run dev
```
(Runs the backend server using `tsx server.ts`)

### Build for Production
```bash
npm run build
```
The output will be in the `dist/` directory.

## Architecture

The project is built as a full-stack application using Express and Vite:

- **Backend:** Express server handles API requests and AI provider interaction.
- **Frontend:** Single Page Application (SPA) served by Vite.
- **AI Integration:** Backend proxies requests to AI providers using secure environment variables.
- **Usage Logging:** Completed translate/compose requests are forwarded to `POST /api/public/log` and stored in Supabase.

## Environment Variables

Create a `.env` file with your API keys:
```env
OPENAI_API_KEY=your_openai_key
# Server-only. No VITE_ prefix: anything prefixed VITE_ is compiled into the
# client bundle and is therefore public. Unset means /api/admin/* rejects
# everything.
ADMIN_API_KEY=your_secret
GOOGLE_SHEET_ID=your_sheet_id
```

For production builds, ensure these are set in your deployment environment. `ADMIN_API_KEY` has
to be set on every host that serves `/api` — both the Render server and the Netlify function.
