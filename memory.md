# Session memory

Two `/batch` runs are recorded here.

- **§§0–6 — iOS Settings redesign + swipe tab navigation.** From the run that
  landed PRs #5–#17 and merged them as #18 (`617c7d0`). Line numbers are as of
  #18 and have drifted since; grep rather than trusting them.
- **§7 — Translate upgrade.** From the run on `claude/laughing-ptolemy-b659m5`
  (`965f0e1`…`c4cbbca`). Line numbers are as of `c4cbbca`.

Everything below was found by agents that actually read or ran the code, so it
can be trusted without re-scanning.

---

## 0. Status — §§1–4 are done

Everything §1–§4 recorded was fixed on `claude/memory-flagged-issues-h3haz8`,
one commit per section. Those sections are kept below as the record of what was
wrong and why, **not as a to-do list** — do not re-investigate them. §5 (never
verified) and §6 (working notes) still stand, with the amendments noted there.

Two corrections to what was recorded:

- **§1.8 did not reproduce.** See the note under it.
- **`tabTalk` was defined in no dictionary**, so the desktop sidebar rendered
  the literal string "tabTalk". A sweep found twelve such keys; all are defined
  now. See the amendment under §2.

Verified in Chromium: 18 assertions across two harnesses, plus the admin guard
probed against a running server. Still unverified: real iOS Safari, real touch
hardware, screen readers — as §5 says.

**One deployment action is outstanding:** set `ADMIN_API_KEY` on Render and on
Netlify, and delete `VITE_ADMIN_SECRET_KEY` from both. Until then the admin
dashboard returns 401 by design. See §4.

---

## 1. Open defects, ranked by user impact  — ALL FIXED

### 1.1 `ComposeTabMobile.tsx:232` — action bar offset and drag shift
Two separate problems in one element, flagged independently by three units.

- It is pinned `fixed bottom-[90px]`, a number tuned to the old 96px tab bar.
  The bar is now 63.5px (the real iOS 49pt), leaving a ~30px gap. Reads as a
  floating button rather than broken, but it should track the new height.
- While a swipe is in progress the page wrapper carries a `transform`, which
  makes it the containing block for its `position: fixed` children — so this bar
  shifts for the duration of the gesture and settles back.

The clean fix for the second is moving the bar out of the tab subtree. Nobody
owned this file during the batch, which is why it was left.

### 1.2 `useSettingsPanel.ts` — feedback submission never checks `response.ok`
The `fetch` in `handleFeedbackSubmit` treats any completed response as success,
so an HTTP 500 takes the success path and shows the thank-you alert.
`feedbackError` can currently only fire on a network-level failure. Confirmed by
running against a preview server with no `/api/feedback` route at all.

### 1.3 `FeedbackSheet.tsx` — focus restore never runs
Same bug unit 13 found and fixed in its own action sheet, inherited from the same
pattern: the focus-restore guard tests only for `body`/null, but `AnimatePresence`
keeps the sheet mounted through its exit spring, so `activeElement` is still the
Cancel button and the restore is skipped. Fix is to also restore when the active
element is still inside the sheet. `SystemSection.tsx` already has the corrected
version — copy from there.

### 1.4 `useSettingsPanel.ts:129,132,145,149,150` — hardcoded Vietnamese notices
`addWallpaperFiles` returns user-facing strings in Vietnamese regardless of
locale. An English or Chinese user who hits the 8-image cap via **upload** gets a
Vietnamese message. The **link** path was localised in #16; the upload path was
not, because the strings live in the hook rather than the component.

### 1.5 `BackgroundCanvas.tsx` — animation loop never stops
No `prefers-reduced-motion` check and no `visibilitychange` handler, so the
canvas keeps drawing in a background tab and ignores the OS reduced-motion
setting. This is R3 in `docs/appearance-system-review.html` §4 and predates the
batch.

**When this is fixed**, the footer string in `BackgroundEffectsSection.tsx` and
its three translations must be rewritten — it currently tells the truth ("effects
keep animating the whole time the app is open, even when the device asks for
reduced motion") and that sentence becomes wrong.

### 1.6 `BackgroundCanvas.tsx` — unquoted CSS url()
Builds `url(${backgroundImage})` without quotes, so a raw
`data:image/svg+xml,…` URL pasted into the wallpaper link box is dropped by the
CSS parser and paints nothing. Other data URL types are unaffected.

### 1.7 `LayoutDesktop.tsx` — tab order disagrees with mobile
The desktop sidebar lists `vocab` and `history` in the opposite order to the
mobile nav, which is what `TAB_ORDER` encodes. The directional page transition
derives its direction from that array, so on desktop that one pair animates
backwards.

### 1.8 `handleClearHistory` leaves React state populated — DID NOT REPRODUCE
This entry is wrong, and appears to predate the tab extraction. The history list
lives in `useHistoryTab`, mounted by `HistoryTabMobile`/`HistoryTabDesktop`, and
`App.tsx` renders that tab conditionally inside `AnimatePresence` — so leaving
the tab unmounts the hook and returning re-reads storage. Clearing is only
reachable from Settings, i.e. from another tab, so the stale list described here
cannot be produced.

A `historyVersion` counter was added anyway: clearing storage has no other way
to reach that state if the tab is ever kept mounted.

---

## 2. Consistency seams left by parallel work  — ALL FIXED

**Amendment.** The locale audit that produced the "27 keys short" figure
compared the three dictionaries against `en`. It could not catch a key missing
from `en` as well — and twelve were: `tabTalk`, `copied`, `copyFailed`,
`custom`, `customConfiguration`, `generating`, `loading`, `matchedVocab`,
`noHistory`, `paste`, `translation`, `yesterday`. Each rendered its own
identifier on screen (the desktop sidebar's Live Translate tooltip read
"tabTalk"). All four dictionaries are now 292 keys with full parity, and every
`t('...')` call site in `src/` has an `en` entry. If you add a key, check it
against the call sites, not just against `en`.

- **`overWallpaper` prop.** `LanguageSection` accepts one and swaps
  `bg-panel` → `bg-surface`; every other section uses `bg-surface`
  unconditionally. Both are visually correct. The unconditional form is the
  agreed direction — `TalkTabDesktop.tsx:33-35` states why in the code. Drop the
  prop when convenient.
- **Model registry placement.** `SUPPORTED_MODELS` lives in `constants.ts` but
  the icon and caption for each model live in `ModelSection.tsx`. Adding a fourth
  model silently yields a fallback icon and no caption. Moving the registry into
  `constants.ts` makes it one edit.
- **Chinese locales are 27 keys short.** After #18: `en` 276, `vi` 276,
  `zh-CN` 249, `zh-TW` 249, no duplicates in any. Missing keys fall back to
  English, which is why nothing renders a raw key — but zh users see English
  strings scattered through the UI.

---

## 3. Known-dead code (safe to delete, verified unused)  — ALL DELETED

- `UserPreferences['fontSize']` declares `'md'`; nothing in the UI or
  `App.tsx`'s class mapping handles it. `TypographySection` normalises any
  unrecognised value to `base`.
- `fontFamily` is typed `string` rather than the union of the four handled values.
- `useUserPreferences` exports `setBgImage`, `saveWallpaper`,
  `removeSavedWallpaper`, `renameSavedWallpaper`, `setEffect` — only
  `preferences` and `setPreferences` are consumed.
- `--app-bg-opacity` and `--app-blur-intensity` are written by `App.tsx` on every
  preference change and read by nothing.
- `ThemeMode` / `Theme` in `types.ts` and `AppState.themeMode` are legacy; the
  theme consolidation made `UserPreferences.theme` the single owner.
- Each of the seven `*.tsx` dispatchers calls `useDeviceDetect` independently, so
  ~7 `resize` listeners are live at once.

---

## 4. Security note (pre-existing, documented in the code)  — FIXED

`handleFeedbackSubmit` doubles as an admin unlock: typing the admin key into the
feedback box opens the dashboard. The key was compared client-side against a
`VITE_` env var, so **it shipped in the bundle**, and the `/api/admin/*` routes
were unauthenticated — `GET /api/admin/responses` returns up to 50 rows of real
user input and output text out of `app_logs`.

The check is now the server's. `shared/adminAuth.ts` holds one `requireAdmin`
middleware, mounted by both `server.ts` and `netlify/functions/api.ts`; it reads
`ADMIN_API_KEY` (server-only, no `VITE_` prefix) and compares the `x-admin-key`
header with `timingSafeEqual`. The client sends what the user typed and opens the
dashboard only on a 200. `VITE_ADMIN_SECRET_KEY` and both hardcoded fallback
literals are gone.

**It is fail-closed**: with `ADMIN_API_KEY` unset, every admin request is
rejected. So the variable has to be set on **both** hosts or the dashboard stops
working. Treat any value `VITE_ADMIN_SECRET_KEY` ever held as public — it has
been in every shipped bundle — and pick a new secret.

This is still a shared secret typed into a text field, not a login. What changed
is that the secret no longer reaches the client and the data routes are closed.

---

## 5. What was never verified

No agent could test these, so treat them as unknown rather than working:

- **Real iOS Safari.** `env(safe-area-inset-*)` resolves to `0` in headless
  Chromium, so all safe-area padding is correct by construction but unmeasured on
  device. Same for the `visualViewport` keyboard lift in `FeedbackSheet`.
- **Real touch hardware.** All gesture testing was emulated Chromium touch via
  CDP.
- **Screen readers.** ARIA attributes and keyboard paths were checked; no
  VoiceOver/NVDA run.
- **Industrial palette**, for several sections — verified by contrast
  calculation, not screenshot.
- **Drag-to-dismiss** on `FeedbackSheet` (Cancel / Escape / scrim were verified).

---

## 6. Working notes for this repo

Things that cost time to discover.

**Build and test**
- No test suite. `npm run lint` is `tsc --noEmit`, and that is the whole suite.
- `node_modules` is gitignored and absent in a fresh worktree. Symlink it:
  `ln -sfn /home/user/Smart-Reply-Assist-SRA-/node_modules ./node_modules`.
- Playwright is installed `--no-save` in that shared `node_modules`. A bare
  `chromium.launch()` **fails** — the bundled browser build does not match. Use
  `executablePath: '/opt/pw-browsers/chromium'`.
- Reusable harness: `scratchpad/e2e-smoke.mjs`. It dismisses the "what's new"
  modal and the PWA install banner (both cover the page on an iPhone UA), opens
  Settings, screenshots per theme, and drives a CDP touch swipe.
  **The scratchpad does not survive the session** — that file was gone and had
  to be rewritten. Things worth knowing next time:
  - Seed `app_last_seen_version` in an `addInitScript` rather than trying to
    click the changelog modal away; it renders inside `#root`, not on `body`.
  - A script outside the repo cannot resolve `playwright` by ESM name. Symlink
    `node_modules` next to it.
  - `npx tsx server.ts` spawns a child; killing the wrapper PID leaves the port
    bound, and the next server silently fails to start while the old one keeps
    answering. Always re-check the port between runs, or a "fail-closed" probe
    will be answered by the previous, differently-configured process.
  - To prove the canvas loop is parked, count `ctx.clearRect` calls, not
    `requestAnimationFrame` — `motion`'s frameloop shares rAF and keeps ticking.
  - Assigning an invalid value to `.style` is a no-op, so a before/after CSS
    probe has to use a fresh element or it just reads back the previous value.

**Traps**
- `.githooks/pre-commit` bumps `package.json`'s patch version on **every** commit.
  Across parallel branches that guarantees a conflict in each. Commit with
  `--no-verify` and never touch `package.json` / `package-lock.json`.
- `t()` returns the **key** on a miss, so `t('x') || 'fallback'` is unreachable
  dead code — and it silently hides a key missing from `en` too, which is how
  twelve of them reached the screen as raw identifiers. New strings must be
  added to all four dictionaries in `src/i18n/index.ts`. Audit by walking the
  `t('...')` call sites, not by diffing the dictionaries against each other.
  (Line numbers for the four blocks drift with every addition; grep for
  `^\s*(en|vi|'zh-CN'|'zh-TW'):\s*\{` instead of trusting a recorded one.)
- Changing locale in a test requires driving the Settings UI. `App.tsx:102`
  derives `t` from React state, so writing `sra_global_language` to
  `localStorage` does nothing.
- Tailwind **v4**: a colour utility exists only if its token is declared in the
  `@theme` block. `bg-surface` once emitted no CSS at all for this reason.
- `position: sticky` cannot work on the mobile settings page — `App.tsx`'s
  `flex-1 overflow-y-auto` wrapper never scrolls itself but is still the sticky
  scrollport. Use `fixed` + `createPortal`.
- Anything `position: fixed` inside the settings tree needs a portal: the desktop
  card's `backdrop-blur` and the tab's `motion.div` transform both become the
  containing block and clip it.
- Blink resets inherited `touch-action` on every scroll container, so setting it
  on a swipe surface alone does not survive. `useSwipeTabs` re-applies
  `pan-y pinch-zoom` to vertical-only scrollers inside the surface.
- Mark any horizontally scrolling element `data-no-swipe` or it fights the tab
  gesture.

- `--tab-bar-h` is published on `<html>` by `LayoutMobile` from the tab bar's
  measured height. Anything docked above the bar reads it; do not reintroduce a
  tuned pixel constant, and remember it is `0` on desktop.
- Admin routes need `ADMIN_API_KEY` in the environment or they 401. `npm run
  dev` without it is correct behaviour, not a broken server.

**Design system**
- Four palettes in `src/index.css:4-122`: light (`:root`), `dark`, `cyberpunk`,
  `industrial`. Use `bg-app bg-panel bg-surface bg-bg-input text-text-main
  text-text-muted text-accent-text text-accent-on border-border-main
  border-border-strong`. Never a literal colour.
- `text-white` on an accent fill fails AA on cyberpunk (3.90:1) and industrial
  (2.85:1) — `text-accent-on` is the per-theme foreground.
- `bg-panel/20` over the already-translucent `--bg-card` composites to ~0.17.
  Use `bg-surface` (`--surface-solid`, 0.92) over a wallpaper.
- No single red clears AA on all four cards: `red-600` on light (4.83:1),
  `red-400` on dark (6.03), cyberpunk (6.97), industrial (4.82). Key it off
  `data-theme` — Tailwind's `dark:` is a `prefers-color-scheme` query and ignores
  a chosen palette.
- Accessibility bar, from `docs/mobile-ui-ux-spec.html` §4.5: targets ≥44×44px,
  body text ≥7:1, secondary ≥4.5:1, no horizontal overflow at 320px — truncate
  or shorten the string, never wrap.
- `motion` is imported from `'motion/react'`, never `framer-motion`.

**Batch orchestration**
- ~130–240k subagent tokens per unit with full browser verification. A session
  limit window fits roughly 2–4. Running more than two workers concurrently just
  means several die at 90% and their work has to be resumed.
- Resuming a killed agent preserves its worktree and context and is much cheaper
  than restarting.
- Branch names cannot nest under an existing ref: `claude/x` and `claude/x/y`
  cannot coexist. Use `claude/x-y`.
- Per-unit PRs that each edit the same two files do **not** merge mechanically.
  The i18n conflicts resolve by keeping both sides; the panel bodies had to be
  rewritten by hand (`6feb7fb`).

---

## 7. Translate upgrade — `965f0e1`…`c4cbbca`

Seven commits on `claude/laughing-ptolemy-b659m5`, six planned units plus one
fix. Everything in §7 is **done**, not a to-do list; the open items are
collected in §7.4.

### 7.1 The root cause was the data, not the algorithm

The brief was "inject the glossary more accurately". The algorithm was the
smaller half of the problem.

- **Two importers disagreed on field names.** `netlify/functions/api.ts`'s
  `/import-vocab` parsed the sheet correctly but returned
  `{meaning_vi, target_en, target_zh_cn, …}`, while `VocabItem` and every
  consumer read `{vi, en, zh_cn, …}`. `storage.syncWithCloud()` only calls the
  *other* importer (`netlify/functions/import-vocab.ts`) when the hostname
  contains `netlify.app`, so **on localhost and on Render the entire glossary
  was silently empty** — `item.vi` was `undefined` for all 507 rows. The
  standalone importer was broken too, from the opposite side: its
  `transformHeader` only lowercased, so `Meaning (VI)` never became `vi` and its
  `.filter(item => item.vi)` discarded every row.
  Both now share `shared/vocabNormalize.ts`, which accepts either header style.
- **`term` is a category label, not a phrase.** In `Vocabulary Library.csv` the
  `Term` column holds `Component`, `Dept name` and similar. The chips matched on
  it, so "detected terms" was matching category names. The source phrases are
  `vi`/`en`/`zh_cn`/`zh_tw`; **never match against `term`.**
- `storage.getVocab()` now heals records already stored in the broken shape, so
  a user does not have to re-sync.

### 7.2 One matcher, in `src/services/glossary.ts`

There were two independent matchers — one for the chips (on `term`), one for the
prompt (on the phrase columns) — so what the user saw was never what was
injected. Both are gone; `matchGlossary()` is the only one.

Decisions worth not re-deriving:

- **No `RegExp` is ever built from library data.** Occurrences are found with
  `indexOf` on folded strings and boundaries are decided by inspecting adjacent
  characters. The old code interpolated unescaped terms into `new RegExp()`, so
  a term like `C+ (A.1)` either threw or matched the wrong span. There is
  deliberately no `escapeRegExp` helper — there is nothing left to escape.
- **Diacritic folding preserves offsets**, by pushing the original index once
  per folded character, so `text.slice(start, end)` is correct on the *original*
  string.
- **Boundaries are per-edge**, required only when that edge's character is a
  letter/digit in a script that separates words. `\b` is ASCII-only and was
  wrong for Han and Burmese.
- Longest match wins, measured on the string that **actually matched** (the old
  sort used `max(vi, en, zh_cn)` lengths), then overlapping spans are suppressed
  so "quality" and "quality control" cannot both be injected for one span.
- Caps at 40 matches / 4000 chars, enforced **inside `matchGlossary`**, not in
  `serializeGlossary` — if the serializer trimmed separately the chips would
  again show more than the prompt got.
- Folded phrases are cached in a module-level `Map`: 3.4 ms → 0.72 ms per call,
  and it runs on every keystroke.
- `AIService.translate` matches internally against the text it is **about to
  send**, so OCR-extracted image text is covered. The old
  `matched.length > 0 ? matched : currentVocab` branch is gone — it dropped
  entries when the client matcher hit anything and shipped all 507 when it did
  not.

### 7.3 Prompts, model config, UI

- `shared/modelConfig.ts` owns `APP_ENGINE_ID`. Four routes used to hardcode
  `'gpt-5.6-luna'` and ignore the env var, so setting `APP_ENGINE_ID`
  redirected only two of six call sites.
- `createChatCompletion(openai, params, tuning)` retries **once** with all
  optional parameters stripped when a 400 names an unsupported parameter, and
  rethrows everything else. `gpt-5.6-luna`'s tuning entry sends no optional
  sampling parameters at all — its supported surface could not be verified from
  here, and a guess would have 500'd the route. Retry happens before any
  `res.write()`, or the stream could not be restarted.
- `new OpenAI()` used to run at module load. With `OPENAI_API_KEY` unset it
  threw at cold start and took **the whole router** down — `/health`,
  `/admin/*`, `/import-vocab`, not just the AI routes. Now lazy via
  `getOpenAI()`.
- `buildTranslateSystemPrompt()` is a pure exported function so the
  language × glossary × summarize matrix is testable without an API key. Script
  enforcement now covers every target (only Chinese Traditional had one), and
  summary-mode section labels follow the target language instead of always being
  Vietnamese.
- **The `.ios-*` classes in `src/index.css` finally have consumers.** Both
  Translate tabs are built on them; they were written for the settings redesign
  and then never used. `.ios-toolbar` was added here.
- **`.ios-toolbar > button`'s 44px floor is deliberately outside
  `@layer components`.** A cascade layer is resolved *before* specificity, so
  from inside the layer that rule loses to a child's own plain utilities
  (`VoiceVisualizer` ships `w-10 h-10 rounded-xl`). The cost: a utility on a
  toolbar button cannot resize it.
- Both textareas guard Enter with `e.nativeEvent.isComposing`. Telex and Pinyin
  commit a candidate with Enter, so Enter-to-translate was eating the keystroke
  that finishes a Vietnamese or Chinese word and translating half-typed input.
- `crypto.randomUUID()` is only defined in a secure context. It was called as a
  bare global in `shared/vocabNormalize.ts`, which ships in the browser bundle —
  on plain http that threw out of `storage.getVocab()` and aborted the
  `Promise.all` hydration in `App.tsx`.

### 7.4 Still open

- **`Auto` gets no glossary.** `matchGlossary(text, vocab, 'Auto')` returns `[]`
  by design: there is no target column to pin, and pinning English would be
  wrong. The prompt half is fixed (the model now detects the source and picks
  the counterpart target; it no longer reads "Translate to Auto"), but the
  client sends `glossary: ''` before the request leaves the browser, so **no
  server-side change can recover this.** A real fix resolves a concrete target
  on the client *before* matching — that changes user-visible behaviour, so it
  was left as a decision rather than assumed.
- **Nothing was verified in a browser or against a real model.** Verification
  was `tsc --noEmit`, `npm run build`, and `npx tsx` scripts against the real
  507-row CSV. `OPENAI_API_KEY` is not set in the agent environment, so the
  rewritten prompt has never been sent to an actual model — only its 28-way
  construction matrix was asserted. The iOS layout is correct by construction
  and unmeasured on device, exactly as §5 says of the previous batch.
- `zh-CN` and `zh-TW` are missing three keys `en`/`vi` have: `clearHistory`,
  `feedbackErrorReport`, `supportFeedback`. Pre-existing, outside Translate,
  untouched.

### 7.5 Working notes that cost time

- **`node_modules` is absent AND there is no shared copy to symlink to.** §6's
  `ln -sfn …/node_modules` advice is stale — run `npm install` in the primary
  worktree first. It also rewrites `package-lock.json`'s `version` field to
  match `package.json`; revert that, do not commit it.
- **Running the units sequentially in the primary directory avoided every merge
  conflict** §6 warns about. Six units touching `useTranslateTab.ts`,
  `ai.ts`, `api.ts` and `i18n/index.ts` produced zero conflicts because each
  saw the previous one's commit. This is strictly better than parallel
  worktrees when the units share files.
- A session rate limit killed one unit after it had written the code but before
  it committed. **The working tree survives** — finishing the remaining
  verify-and-commit steps directly was far cheaper than respawning.
- `grep -c` exits 1 when the count is 0, which breaks an `&&` chain even though
  0 is the passing result. Use `;` between verification greps.
- The i18n audit is worth scripting properly: parse the four dictionary blocks
  by brace matching, extract `t('…')` call sites from the component, and assert
  every key resolves in all four. Both UI units passed on the first try this
  way, against twelve keys reaching the screen as raw identifiers last time.
