// Deterministic stand-in for the Claude Messages API, used only by the PWA test run.
// Every reply echoes what the request asked for, so a test can tell a fresh
// answer from a stale cached one:
//   translate  -> "TR|FULL|<text>" or "TR|SUM|<text>" (summary-mode prompt)
//   OCR        -> "OCR_TEXT_FROM_IMAGE"
//   compose    -> "CMP|<fingerprint of the system prompt>|<user text>"
//   expert     -> "EXPERT|<question>" + one web citation
//   security   -> {"keywords":["casino"]}
// Start: node mock_claude.mjs <port>
import http from 'http';
import crypto from 'crypto';

const port = Number(process.argv[2] || 4011);

function userText(body) {
  const c = body.messages?.[0]?.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.filter((b) => b.type === 'text').map((b) => b.text).join(' ');
  return '';
}

function reply(body) {
  const sys = String(body.system || '');
  const text = userText(body);
  if (body.output_config?.format) {
    if (sys.includes('security')) return { text: '{"keywords":["casino"]}' };
    return { text: '{"user_facing":false,"features":[]}' };
  }
  if (sys.includes('quang học')) return { text: 'OCR_TEXT_FROM_IMAGE' };
  if (sys.includes('mandatory_workflow')) {
    const fp = crypto.createHash('sha1').update(sys).digest('hex').slice(0, 8);
    return { text: `CMP|${fp}|${text}` };
  }
  if (body.tools?.length) {
    return { text: `EXPERT|${text}`, citation: { url: 'https://satra.com/guide', title: 'SATRA guide' } };
  }
  const mode = sys.includes('Key Point 1') ? 'SUM' : 'FULL';
  return { text: `TR|${mode}|${text}` };
}

http
  .createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', async () => {
      const body = JSON.parse(raw || '{}');
      const r = reply(body);
      const content = [{ type: 'text', text: r.text, citations: r.citation ? [{ type: 'web_search_result_location', url: r.citation.url, title: r.citation.title, cited_text: 'x', encrypted_index: 'e' }] : null }];
      if (body.stream) {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        const ev = (t, d) => res.write(`event: ${t}\ndata: ${JSON.stringify({ type: t, ...d })}\n\n`);
        ev('message_start', { message: { id: 'm', type: 'message', role: 'assistant', model: body.model, content: [], stop_reason: null, usage: { input_tokens: 1, output_tokens: 0 } } });
        ev('content_block_start', { index: 0, content_block: { type: 'text', text: '' } });
        // Split into a few chunks so the client really streams.
        const parts = r.text.match(/.{1,12}/gsu) || ['']; // u: never split a surrogate pair
        const delay = Number(process.env.MOCK_CHUNK_DELAY_MS || 0);
        for (const p of parts) {
          ev('content_block_delta', { index: 0, delta: { type: 'text_delta', text: p } });
          if (delay) await new Promise((r) => setTimeout(r, delay));
        }
        ev('content_block_stop', { index: 0 });
        ev('message_delta', { delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 2 } });
        ev('message_stop', {});
        return res.end();
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ id: 'm', type: 'message', role: 'assistant', model: body.model, content, stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 2 } }));
    });
  })
  .listen(port, () => console.log(`mock claude on ${port}`));
