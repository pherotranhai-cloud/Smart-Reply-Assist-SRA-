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
Settings (the key is read from `VITE_ADMIN_SECRET_KEY`). It tracks exactly three metrics:

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
VITE_ADMIN_SECRET_KEY=your_secret
GOOGLE_SHEET_ID=your_sheet_id
```

For production builds, ensure these are set in your deployment environment.
