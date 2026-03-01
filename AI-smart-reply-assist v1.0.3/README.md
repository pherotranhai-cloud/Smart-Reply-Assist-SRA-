# Smart Reply Assist (SRA) - Unified Codebase

This project is a unified codebase for both a Chrome Extension and a PWA.

## Build Targets

### 1. Chrome Extension (Manifest V3)
Builds the UI and packages it with the extension background script and manifest.

- **Build Command:** `npm run build:ext`
- **Output:** `dist-ext/`
- **Installation:**
  1. Open `chrome://extensions`
  2. Enable "Developer mode"
  3. Click "Load unpacked"
  4. Select the `dist-ext/` folder

### 2. PWA (Installable Web App)
Builds the UI as a standard web application with service worker support for offline usage and installation.

- **Build Command:** `npm run build:pwa`
- **Output:** `dist/`
- **Deployment:** Deploy the contents of `dist/` to any static hosting provider.

## Development

### Extension Mode
Runs Vite in extension mode. Note that HMR is limited in extension contexts.
- **Command:** `npm run dev:ext`

### PWA Mode
Runs Vite in PWA mode with full HMR support.
- **Command:** `npm run dev:pwa`

## Architecture

The project uses a **Runtime Abstraction Layer** (`src/runtime/`) to handle differences between the extension and web environments:

- **Storage Adapter:** Automatically switches between `chrome.storage` and `localStorage`.
- **AI Transport:** Proxies AI calls through the background script in extension mode to avoid CORS issues and keep keys secure, while calling providers directly in PWA mode.
- **Window Adapter:** Handles standalone window behavior for the extension.

## Environment Variables

Create a `.env` file with your Gemini API key:
```env
GEMINI_API_KEY=your_key_here
```

For production builds, ensure these are set in your CI/CD environment.
"# Smart-Reply-Assist-SRA-" 
