# Smart Reply Assist (SRA)

Cyberpunk-themed AI assistant for translation and message composition.

## Features

- **AI Translation:** Multi-language support with vocabulary integration.
- **Smart Composition:** Generate replies based on context, audience, and tone.
- **Vocabulary Library:** Manage custom terms and meanings.
- **Copy Format:** Chooses what the copy buttons put on the clipboard, so `**bold**` never
  lands in a chat box as literal asterisks.
- **Cyberpunk UI:** High-contrast, neon-themed interface.
- **Admin Dashboard:** Lightweight operational view of the three metrics below.

## Copy Format

The model answers in Markdown and the app renders it with `react-markdown`, so `**text**` shows
on screen as real bold. The copy buttons used to hand that raw Markdown to the clipboard, which
is why pasting into Zalo, WeChat or Messenger — none of which parse Markdown — showed the
asterisks around the words meant to stand out.

Settings → **Copy Format** now decides what a copy produces. `src/utils/richText.ts` converts the
Markdown; `copyFormattedText` in `src/utils/clipboard.ts` puts it on the clipboard, and every copy
button in the app goes through it.

| Mode | Clipboard contents |
| --- | --- |
| **Clean text** (default) | Markers removed. The clipboard also carries a `text/html` flavour, so a target that accepts rich text (Word, Gmail, a desktop chat client built on a web view) still pastes real bold, while a plain-text box gets the clean text. |
| **Unicode bold** | Bold spans become Unicode Mathematical Sans-Serif Bold glyphs, which are ordinary characters and survive any app. That alphabet only covers `A-Z`, `a-z` and `0-9`, so a span holding Vietnamese diacritics, Chinese or emoji is left plain rather than half-converted — product codes, quantities and dates convert, `Xác nhận` does not. |
| **UPPERCASE** | Bold spans are upper-cased — emphasis Vietnamese keeps but Chinese and Japanese cannot show. |
| **Keep Markdown** | The raw text, for apps that parse Markdown themselves. |

Only the default adds the HTML flavour: the other three are explicit choices about what the
*plain* text should look like, and a styled flavour next to them would override that choice in
every app that prefers rich text.

The conversion also normalises the rest of what the model writes: headings keep their text (as a
bold span) and lose the hashes, bullets become `•`, task boxes become `☐`/`☑`, links become
`label (url)`, quote markers and code fences are dropped, and `snake_case` names are left alone.

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
- **Frontend:** Single Page Application (SPA) served by Vite, built as a single bundle, with
  every tab kept mounted once it has been opened.
  Vocab, Talk, History, Settings and the admin dashboard used to be `React.lazy()` chunks
  fetched on first visit to their tab; that download landed inside the swipe that asked for
  the tab, so the page animated in over a spinner. Everything loads once now, behind the
  splash screen, and a tab switch is only a render — do not reintroduce `lazy()` here without
  measuring that trade again. The build's chunk-size warning is raised in `vite.config.ts`
  for the same reason.

  Tabs no longer unmount either. A page is mounted the first time its tab is opened and then
  stays mounted for the session, `display: none` while another tab is showing, so coming back
  is a style flip and a spring rather than a fresh mount that re-runs every effect and re-reads
  storage — the tab keeps its scroll position, its search box and its results. Two things follow
  from that and must stay wired: the Talk tab is told when it stops being active and closes its
  microphone and WebRTC session there (`useTalkTab`), since leaving the tab is no longer an
  unmount, and the History tab re-reads storage each time it comes back (`useHistoryTab`),
  since a remount no longer does it. Anything a tab renders through a portal has to read
  `useTabActive` and render nothing while its tab is away: a portal lands in `<body>`, where the
  tab's `display: none` cannot reach it, and it used to disappear only because the tab unmounted.
  The Settings header bar and Compose's action bar both do this.
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
