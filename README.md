# Smart Reply Assist (SRA)

Cyberpunk-themed AI assistant for translation and message composition.

## Features

- **AI Translation:** Multi-language support with vocabulary integration.
- **Smart Composition:** Generate replies based on context, audience, and tone.
- **Vocabulary Library:** Manage custom terms and meanings.
- **Copy Format:** Chooses what the copy buttons put on the clipboard, so `**bold**` never
  lands in a chat box as literal asterisks.
- **Cyberpunk UI:** High-contrast, neon-themed interface.

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
  Vocab, History and Settings used to be `React.lazy()` chunks
  fetched on first visit to their tab; that download landed inside the swipe that asked for
  the tab, so the page animated in over a spinner. Everything loads once now, behind the
  splash screen, and a tab switch is only a render — do not reintroduce `lazy()` here without
  measuring that trade again. The build's chunk-size warning is raised in `vite.config.ts`
  for the same reason.

  Tabs no longer unmount either. A page is mounted the first time its tab is opened and then
  stays mounted for the session, `display: none` while another tab is showing, so coming back
  is a style flip and a spring rather than a fresh mount that re-runs every effect and re-reads
  storage — the tab keeps its scroll position, its search box and its results. One thing follows
  from that and must stay wired: the History tab re-reads storage each time it comes back
  (`useHistoryTab`), since a remount no longer does it. Anything a tab renders through a portal has to read
  `useTabActive` and render nothing while its tab is away: a portal lands in `<body>`, where the
  tab's `display: none` cannot reach it, and it used to disappear only because the tab unmounted.
  The Settings header bar and Compose's action bar both do this.
- **AI Integration:** Every AI task (translate, OCR, compose, expert search, security analysis)
  calls the Claude API with `claude-sonnet-5-5` (`shared/modelConfig.ts`). There is no other AI
  provider.
- **Server-only configuration:** Every environment variable — API keys, Supabase credentials,
  model ids — is read by the server (`process.env`) and never by the frontend. The client bundle
  has no `import.meta.env` / `VITE_*` reads and calls only same-origin `/api/*` routes, so no
  secret or host name is compiled into it. Do not add `VITE_`-prefixed variables: anything with
  that prefix is shipped to every visitor.
- **Usage Logging:** `/api/translate`, `/api/compose` and `/api/expert-search` log each completed
  request to Supabase (`app_logs`) server-side.

## Environment Variables

Create a `.env` file with your API keys:
```env
# All variables are server-only (read via process.env). Never prefix one with
# VITE_: those are compiled into the client bundle and are therefore public.

# Claude API key: every translate/compose/OCR/expert-search/security call.
ANTHROPIC_API_KEY=your_anthropic_key
# Optional: another Claude model id; non-Claude ids fall back to claude-sonnet-5-5.
# APP_ENGINE_ID=claude-sonnet-5-5
# Optional: usage logs, feedback and security rules.
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
GOOGLE_SHEET_ID=your_sheet_id
```

For production builds, set these on every host that serves `/api` (the Netlify function and/or
the Render server). Variables from the previous setup are no longer read and can be deleted:
`OPENAI_API_KEY`, `ADMIN_API_KEY`, `RAG_*`, `GEMINI_API_KEY`, `VITE_RENDER_SERVER_URL`,
`VITE_API_URL`.
