# Smart Reply Assist (SRA)

Cyberpunk-themed AI assistant for translation and message composition, built as a Pure Progressive Web App (PWA).

## Features

- **AI Translation:** Multi-language support with vocabulary integration.
- **Smart Composition:** Generate replies based on context, audience, and tone.
- **Vocabulary Library:** Manage custom terms and meanings.
- **PWA Support:** Installable on desktop and mobile with offline capabilities.
- **Cyberpunk UI:** High-contrast, neon-themed interface.

## Development

### Run Development Server
```bash
npm run dev
```

### Build for Production
```bash
npm run build
```
The output will be in the `dist/` directory.

## Architecture

The project is built as a standalone Single Page Application (SPA) with PWA capabilities:

- **Storage:** Uses standard `localStorage` for persistent data.
- **AI Integration:** Calls Gemini API directly from the client.
- **Service Worker:** Handles caching for offline performance and installation.

## Environment Variables

Create a `.env` file with your Gemini API key:
```env
GEMINI_API_KEY=your_key_here
```

For production builds, ensure these are set in your CI/CD environment.
