import type { Context } from '@netlify/functions';
import { isClaudeConfigured } from '../../shared/modelConfig';
import { logTranslation, startTranslation, type TranslateRequest } from '../../shared/translate';

/**
 * POST /api/translate on Netlify (netlify.toml rewrites it here).
 *
 * A modern (Request -> Response) function so the translation streams to the
 * browser as Claude writes it. The Lambda-style handler in api.ts
 * (`serverless(app)`) buffers its whole response, so on Netlify the user
 * used to stare at an empty box until the last word was written. Render
 * still serves the Express route, which shares shared/translate.ts with this.
 */
export default async (req: Request, context: Context) => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }
  if (!isClaudeConfigured()) {
    console.error('Missing ANTHROPIC_API_KEY in environment.');
    return Response.json({ error: 'Server Configuration Error' }, { status: 500 });
  }

  let body: TranslateRequest;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Awaited before the response starts, so a rejected request (auth, bad
  // image, rate limit) still returns a JSON error the client can show.
  let chunks: AsyncIterable<string>;
  try {
    chunks = await startTranslation(body);
  } catch (error: any) {
    console.error('Translation error:', error?.message);
    return Response.json({ error: 'Translation failed', details: error?.message }, { status: 500 });
  }

  const encoder = new TextEncoder();
  let outputText = '';
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of chunks) {
          if (!chunk) continue;
          outputText += chunk;
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (error: any) {
        // Headers are already sent: end the stream; the client keeps what arrived.
        console.error('Translation stream error:', error?.message);
      } finally {
        controller.close();
        // Log after the client has the full answer, without holding the response open.
        context.waitUntil(logTranslation(body, outputText, context.ip));
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  });
};
