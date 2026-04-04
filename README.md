# Smart Reply Assist (SRA)

AI assistant for translation and message composition.

## Features

- **AI Translation:** Multi-language support with vocabulary integration.
- **Smart Composition:** Generate replies based on context, audience, and tone.
- **Vocabulary Library:** Manage custom terms and meanings.

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

- **Backend:** Express server handles API requests, rate limiting, and AI provider interaction.
- **Frontend:** Single Page Application (SPA) served by Vite.
- **AI Integration:** Backend proxies requests to AI providers using secure environment variables.
- **Rate Limiting:** IP-based rate limiting (20 requests/hour) is enforced on the backend.

## Environment Variables

Create a `.env` file with your API keys:
```env
OPENAI_API_KEY=your_openai_key
ADMIN_SECRET_KEY=your_secret
GOOGLE_SHEET_ID=your_sheet_id
```

For production builds, ensure these are set in your deployment environment.
