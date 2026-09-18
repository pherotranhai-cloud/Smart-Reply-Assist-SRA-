import express, { Router } from 'express';
import serverless from 'serverless-http';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import cors from 'cors';
import crypto from 'crypto';
import axios from 'axios';
import Papa from 'papaparse';
import OpenAI from 'openai';
import {
  createSupabaseClient,
  countTotalRequests,
  fetchRecentResponses
} from '../../shared/adminService';
import { requireAdmin, warnIfAdminAuthUnconfigured } from '../../shared/adminAuth';
import { countOnline, recordHeartbeat } from '../../shared/presence';
import { normalizeHeader, extractVocabRow, vocabHashKey, hasSourcePhrase } from '../../shared/vocabNormalize';
import { APP_ENGINE_ID, tuningFor, createChatCompletion } from '../../shared/modelConfig';

dotenv.config();

warnIfAdminAuthUnconfigured('netlify/functions/api.ts');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID || '16IdWFaUWoGjhljq-fDOwneB7cxnUXAG22EdjtGM1DXY';

const supabase = createSupabaseClient();

const logToSupabase = async (payload: any) => {
  if (!supabase) return;
  try {
    const insertPayload = {
      ...payload,
      created_at: new Date().toISOString()
    };
    const { error } = await supabase.from('app_logs').insert([insertPayload] as any);
    if (error) {
      console.error('Supabase logging error:', error);
      // Self-healing: if ip_address column does not exist in app_logs table, retry without it
      if (error.message && error.message.includes('ip_address') && 'ip_address' in insertPayload) {
        console.log('Retrying Supabase insert without ip_address...');
        const { ip_address, ...fallbackPayload } = insertPayload;
        const { error: retryError } = await supabase.from('app_logs').insert([fallbackPayload] as any);
        if (retryError) {
          console.error('Supabase logging retry error:', retryError);
        }
      }
    }
  } catch (err) {
    console.error('Supabase logging exception:', err);
  }
};

// Built lazily rather than at module load: `new OpenAI({apiKey: undefined})`
// throws immediately, which used to take the whole cold start down with it
// (every route — /health, /admin/*, /import-vocab, not just the OpenAI-backed
// ones, which already guard on OPENAI_API_KEY before touching this client).
let openaiClient: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!openaiClient) openaiClient = new OpenAI({ apiKey: OPENAI_API_KEY });
  return openaiClient;
}

const app = express();
export const router = Router();

app.use(cors());
app.use(express.json({ limit: '10mb' }));


router.get('/health', (req, res) => res.json({ status: 'ok' }));

/**
 * Loose language name/code -> canonical display name + script-enforcement
 * sentence. Used by both /compose and /translate below (/compose used to
 * have this exact mapping as its own local `mappedLang` / `scriptRule`
 * variables, with no case for Indonesian, Burmese or Vietnamese at all —
 * a second copy /translate would otherwise have had to invent independently,
 * and did originally, which is how the two ended up enforcing scripts for
 * different subsets of LANGUAGES). Unifying them means /compose also starts
 * getting Vietnamese diacritics and real Indonesian/Burmese enforcement
 * (previously just a parenthetical in the display name, not an instruction)
 * it did not have before.
 */
function resolveLanguage(lang: string): { mappedLang: string; scriptRule: string } {
  switch (lang) {
    case 'Chinese (Simplified)':
    case 'zh-CN':
      return { mappedLang: 'Chinese (Simplified Hanzi)', scriptRule: 'MUST use Simplified Chinese characters (简体中文), never Traditional.' };
    case 'Chinese (Traditional)':
    case 'zh-TW':
      return { mappedLang: 'Chinese (Traditional)', scriptRule: 'Ensure all output characters are strictly Traditional Chinese (繁體中文), never Simplified.' };
    case 'Indonesian':
    case 'id':
      return { mappedLang: 'Indonesian (Bahasa Indonesia)', scriptRule: 'Write in standard Bahasa Indonesia spelling and grammar.' };
    case 'Burmese':
    case 'my':
      return { mappedLang: 'Burmese (Myanmar Unicode)', scriptRule: 'Output MUST be Myanmar Unicode script (မြန်မာ), never Zawgyi encoding.' };
    case 'Vietnamese':
    case 'vi':
      return { mappedLang: 'Vietnamese', scriptRule: 'Use fully accented Vietnamese diacritics (dấu) on every syllable that takes one — never drop them.' };
    default:
      return { mappedLang: lang, scriptRule: '' };
  }
}

/** resolveLanguage's canonical name, for looking up a language-keyed table (e.g. SUMMARY_LABELS) by loose input. */
function canonicalLangName(lang: string): string {
  const aliases: Record<string, string> = {
    'zh-CN': 'Chinese (Simplified)',
    'zh-TW': 'Chinese (Traditional)',
    id: 'Indonesian',
    my: 'Burmese',
    vi: 'Vietnamese',
    en: 'English',
  };
  return aliases[lang] ?? lang;
}

/**
 * Summary-mode's fixed Markdown section labels, one pair per LANGUAGES entry
 * (src/constants.ts). Previously hardcoded in Vietnamese regardless of
 * target language; kept in a lookup table (rather than left to the model to
 * translate) so the heading text is deterministic for every language we
 * already know about.
 */
const SUMMARY_LABELS: Record<string, { overview: string; keyTakeaways: string }> = {
  'Vietnamese': { overview: 'Nội dung chính / Tổng quan', keyTakeaways: 'Ý chính cần nắm' },
  'English': { overview: 'Overview', keyTakeaways: 'Key Takeaways' },
  'Chinese (Simplified)': { overview: '主要内容 / 概述', keyTakeaways: '重点摘要' },
  'Chinese (Traditional)': { overview: '主要內容 / 概述', keyTakeaways: '重點摘要' },
  'Indonesian': { overview: 'Isi Utama / Ringkasan', keyTakeaways: 'Poin Penting' },
  'Burmese': { overview: 'အဓိက အကြောင်းအရာ', keyTakeaways: 'မှတ်သားရန် အချက်များ' },
};

/**
 * The summary-mode output contract. `targetLang` is the raw (non-Auto)
 * request value; pass undefined for the Auto case, where the target language
 * is not known until the model itself picks one (see buildTranslateSystemPrompt).
 */
function buildSummaryInstruction(targetLang?: string): string {
  if (!targetLang) {
    return `You MUST NOT output the full translation. Instead, output ONLY a structured summary, written in whichever language you determined per the TARGET LANGUAGE rule above, using this exact Markdown shape (write the bracketed labels in that same language; keep the emoji, bold markers and bullet structure unchanged):

### 📋 [Brief Summary Title]
**[Overview label]:**
[A short 2-3 sentence paragraph summarizing the context]

**📌 [Key Takeaways label]:**
- *[Key Point 1]*: Detailed description of the action or key information.
- *[Key Point 2]*: Next action, timing, or affected entity.
- *[Key Point 3]*: (If applicable) Important notes or warnings from the original text.`;
  }

  const labels = SUMMARY_LABELS[canonicalLangName(targetLang)] ?? SUMMARY_LABELS['English'];
  return `You MUST NOT output the full translation. Instead, output ONLY a structured summary in ${targetLang} using the following Markdown format exactly:

### 📋 [Brief Summary Title]
**${labels.overview}:**
[A short 2-3 sentence paragraph summarizing the context]

**📌 ${labels.keyTakeaways}:**
- *[Key Point 1]*: Detailed description of the action or key information.
- *[Key Point 2]*: Next action, timing, or affected entity.
- *[Key Point 3]*: (If applicable) Important notes or warnings from the original text.`;
}

export interface TranslatePromptInput {
  targetLang?: string | null;
  /** The client's pre-built `[{term, translation}]` JSON string, or '' / undefined for none — see src/services/glossary.ts. */
  glossary?: string | null;
  summarize?: boolean;
}

/**
 * Builds /translate's system prompt. Pure and exported so the language x
 * glossary x summarize matrix can be exercised without booting an OpenAI
 * client or an HTTP request (OPENAI_API_KEY is not available in every
 * environment this runs in — see repo memory.md §6).
 *
 * 'Auto' (LANGUAGES in src/constants.ts) is handled entirely in the prompt,
 * not resolved to a concrete language here: matchGlossary(text, vocab,
 * 'Auto') already returns [] on the client (src/services/glossary.ts) since
 * there is no glossary column to pin an unpinned target to, so `glossary` is
 * always '' for an Auto request by the time it reaches this function. No
 * server-side prompt change can recover glossary injection for Auto — that
 * would need the client to resolve a concrete target before matching, which
 * is outside this unit's scope (frontend/glossary matcher are unit 1/2's).
 */
export function buildTranslateSystemPrompt({ targetLang, glossary, summarize }: TranslatePromptInput): string {
  const isAuto = !targetLang || targetLang === 'Auto';

  const targetSection = isAuto
    ? `TARGET LANGUAGE: not pinned by the caller ("Auto"). Detect the dominant language of the SOURCE text yourself, then:
- If the source is Vietnamese, translate into English.
- If the source is anything other than Vietnamese, translate into Vietnamese.
Do not narrate or explain this detection step — output only the translation, in whichever language you determined, using that language's correct script (full Vietnamese diacritics, or the correct Hanzi variant for Chinese).`
    : (() => {
        const { mappedLang, scriptRule } = resolveLanguage(targetLang as string);
        return `TARGET LANGUAGE: Translate to ${mappedLang} with 100% technical accuracy.${scriptRule ? `\n${scriptRule}` : ''}`;
      })();

  const glossaryText = (glossary ?? '').trim();
  const hasGlossary = glossaryText.length > 0 && glossaryText !== '[]';
  const glossarySection = hasGlossary
    ? `\n\nGLOSSARY — mandatory term overrides (JSON array of {term, translation} pairs matched against the source text):
${glossaryText}
These translations are REQUIRED and override your own default wording. A \`term\` still applies when it appears inflected, pluralised, capitalised differently, or embedded inside a longer compound word/phrase in the source — recognise it in any of those forms and substitute the paired \`translation\` verbatim. Do not use a synonym, and do not skip a term just because its surface form in the text does not match the glossary entry exactly.`
    : '';

  const outputContract = summarize
    ? buildSummaryInstruction(isAuto ? undefined : (targetLang as string))
    : 'OUTPUT CONTRACT: Return ONLY the translated text. No preamble, no explanation, no labels, and no markdown code fences — just the translation, ready to paste as-is.';

  return `ROLE: You are an expert factory-floor interpreter translating shop-floor communication (production orders, QA notes, line instructions, safety alerts) between managers, QA and line workers. Maintain the source's tone exactly — a strict or urgent instruction must stay strict or urgent, never softened into a polite suggestion.

${targetSection}

RULES (in order; each governs its own, non-overlapping category of the text):
1. Model numbers, part/product codes and brand names (e.g. "EVA-220X", "Nike", "PU-8850") are copied exactly as written — never translated, never transliterated.
2. Numeric measurements and units (mm, kg, %, pairs, pcs, °C, timestamps) are copied exactly as written; only the quantifier words around them ("khoảng", "approximately", "ít nhất", "at least") are translated.
3. "@name" mentions are copied exactly as written, never translated or transliterated. A job title or role near a mention (e.g. "Line Leader", "QA Supervisor") IS translated — use the glossary's entry for it when one exists.
4. Any term matching a GLOSSARY entry below is mandatory-overridden by that entry's translation (see GLOSSARY for the full contract, including inflected/plural/compound forms).
5. Everything else translates normally, with full technical accuracy and no paraphrasing that would change the instruction's meaning.${glossarySection}

${outputContract}`;
}

router.post('/translate', async (req, res) => {
  if (!OPENAI_API_KEY) {
    console.error("Missing OPENAI_API_KEY in environment.");
    return res.status(500).json({ error: "Server Configuration Error" });
  }

  const { text, targetLang, glossary, image, summarize } = req.body;
  try {
    const systemPrompt = buildTranslateSystemPrompt({ targetLang, glossary, summarize });

    const messages: any[] = [
      { role: 'system', content: systemPrompt }
    ];

    // 2. Build a single unified user content array
    const userContent: any[] = [];

    const hasText = text && text.trim() !== '';

    if (hasText) {
      userContent.push({ type: 'text', text: text });
    }

    if (image) {
      // 3. Robust Vision Instruction
      const imageInstruction = hasText 
        ? "\n\n[IMAGE INSTRUCTION]: Additionally, extract and translate any text found in the attached image. Preserve the original layout, tables, and line breaks. You MUST apply the Glossary and Rules to the extracted text."
        : "[IMAGE INSTRUCTION]: Extract and translate all visible text in this image. Preserve the original layout, bullet points, and line breaks. Strictly follow the System Rules and Glossary above for the translation.";
      
      userContent.push({ type: 'text', text: imageInstruction });
      userContent.push({ type: 'image_url', image_url: { url: image } });
    }

    // 4. Push the unified content as a single user message
    messages.push({ role: 'user', content: userContent });

    const targetModel = req.body.model || APP_ENGINE_ID;

    const stream = await createChatCompletion(
      getOpenAI(),
      { model: targetModel, messages, stream: true },
      tuningFor(targetModel, 'translate')
    );

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    let outputText = '';
    
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        outputText += content;
        res.write(content);
      }
    }
    res.end();

    // Non-blocking log to Supabase
    logToSupabase({
      task_type: 'translate',
      input_text: text || '[Image only]',
      output_text: outputText,
      from_lang: 'auto',
      to_lang: targetLang,
      ip_address: (req as any).clientIp
    });
  } catch (error: any) {
    console.error('Translation error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Translation failed', details: error.message });
  }
});

router.post('/log', async (req, res) => {
  const { task_type, input_text, output_text, from_lang, to_lang } = req.body;
  logToSupabase({
    task_type,
    input_text,
    output_text,
    from_lang,
    to_lang,
    ip_address: (req as any).clientIp
  });
  res.json({ success: true });
});

router.post('/ocr', async (req, res) => {
  if (!OPENAI_API_KEY) {
    console.error("Missing OPENAI_API_KEY in environment.");
    return res.status(500).json({ error: "Server Configuration Error" });
  }

  const { image } = req.body;
  if (!image) {
    return res.status(400).json({ error: "No image provided" });
  }

  try {
    const systemPrompt = "Bạn là một máy nhận diện ký tự quang học siêu tốc. Hãy bóc tách chính xác toàn bộ văn bản có trong hình ảnh này thành chuỗi ký tự thô. Tuyệt đối không mô tả ảnh, không giải thích ngữ cảnh, trả về duy nhất chữ tìm được để tối ưu hóa Latency tối đa.";

    const messages: any[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: [
          { type: 'image_url', image_url: { url: image } }
        ]
      }
    ];

    const targetModel = req.body.model || APP_ENGINE_ID;
    const response = await createChatCompletion(
      getOpenAI(),
      { model: targetModel, messages },
      tuningFor(targetModel, 'ocr')
    );

    res.json({ extractedText: response.choices[0].message.content });
  } catch (error: any) {
    console.error('OCR error:', error.response?.data || error.message);
    res.status(500).json({ error: 'OCR extraction failed', details: error.message });
  }
});

router.post('/talk', async (req, res) => {
  if (!OPENAI_API_KEY) {
    console.error("Missing OPENAI_API_KEY in environment.");
    return res.status(500).json({ error: "Server Configuration Error" });
  }

  const { text, targetLang } = req.body;
  if (!text || !targetLang) {
    return res.status(400).json({ error: "Missing text or targetLang" });
  }

  try {
    const systemPrompt = `# ROLE: Direct_Interpreter
# LOGIC: Translate [Input] to [Target_Lang] instantly.
# RULES: 
- Keep names/codes as-is.
- Use natural/spoken factory tone.
- NO explanations. NO intro. 0% Filler.
- Format: Plain_String only.
- Target Lang: ${targetLang}`;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const targetModel = req.body.model || APP_ENGINE_ID;
    const stream = await createChatCompletion(
      getOpenAI(),
      {
        model: targetModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text }
        ],
        stream: true,
      },
      tuningFor(targetModel, 'talk')
    );

    for await (const chunk of stream) {
      if (chunk.choices[0]?.delta?.content) {
        // Mock SSE format
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
    }
    
    res.write('data: [DONE]\n\n');
    res.end();

  } catch (error: any) {
    console.error('Talk error:', error.message);
    res.status(500).json({ error: 'Talk failed', details: error.message });
  }
});

/**
 * src/constants.ts's ComposeGoal, redeclared rather than imported: this
 * function bundles as a Netlify function and must not pull in the Vite
 * client tree. The two lists have to stay in step — `params.goal` on the
 * wire is one of these strings verbatim, and a token that exists there but
 * not here silently downgrades that preset to the Custom (shapeless) branch.
 */
type ComposeGoalToken = 'Report' | 'Explain' | 'Remind' | 'Consult' | 'Announce' | 'Custom';

const COMPOSE_GOAL_TOKENS: ComposeGoalToken[] = ['Report', 'Explain', 'Remind', 'Consult', 'Announce', 'Custom'];

/**
 * The six goal contracts: what the message opens on, what it must carry,
 * what it closes on, and what it must not do.
 *
 * Each goal gets a whole document contract because the two-token hints these
 * replace (`IF {Goal == "Remind"} -> Start: [Urgent_Hook] | End:
 * [Action_Deadline]`) covered only Remind, Consult and Announce — Report and
 * Explain had no per-goal logic at all, which is why every preset came back
 * reading the same. The shapes are deliberately non-overlapping: a Report
 * that closes on a preventive-action owner, or a Consult that hands over its
 * own answer, means the goal axis is not landing and the presets have
 * collapsed back into one.
 */
const GOAL_CONTRACTS: Record<ComposeGoalToken, string> = {
  Report: `GOAL — DEFECT / INCIDENT ESCALATION.
Open the very first sentence on what is wrong and where: the production line, the model or article name, and the item code. No pleasantry before it. State the quantity affected and when it was found (date, shift or time) as facts in their own right. Close by naming the decision or the support you need from the reader — approval to hold the lot, rework manpower, a material substitution, a schedule change — so the reader knows what is being asked of them. Do NOT close on an apology. Do NOT speculate about blame: no named culprit, no guessed cause, no "probably because". Facts and the ask only.`,

  Explain: `GOAL — ROOT-CAUSE ACCOUNT.
Carry these four moves, in this order, each clearly separated: (1) what happened, stated as the reader observed it; (2) WHY it happened — the actual mechanism, such as a machine setting, a material lot, a skipped inspection step or a tooling wear limit, never the symptom restated in other words; (3) the containment already in place to stop the escape; (4) the preventive action, with a named owner and a concrete date. Do NOT minimise — "minor", "only a few pairs", "no real impact" are not available to you. Do NOT promise a guarantee, a yield figure or a delivery date that the requirements do not state.`,

  Remind: `GOAL — FOLLOW-UP ON SOMETHING ALREADY AGREED.
One subject only: if the requirements raise several open items, follow up on the single most time-critical one and drop the rest. Name the deadline and name the responsible person, by name or by role. If the requirements supply neither, ask the recipient for the missing one explicitly, in a single clause — never invent a date and never guess who owns it. Do NOT re-explain the background: one short reference to what was agreed ("as agreed on Monday") is the maximum, then go straight to the ask.`,

  Consult: `GOAL — REQUEST FOR EXPERT JUDGEMENT.
Give the technical context compactly first — the process step, the material or machine, the parameters already tried and what each of them produced — then ask exactly ONE specific, answerable question. Do NOT ask an open "any advice?" or "what do you think?": a question that cannot be answered with a number, a setting or a yes/no is a failed output. You may offer your own hypothesis, but only as one option for the expert to confirm or reject — never as a settled conclusion, and never in place of the question.`,

  Announce: `GOAL — DIRECTIVE TO THE FLOOR OR A DEPARTMENT.
State what changes, the exact date or shift it takes effect from, and who it applies to — which lines, which departments, which shifts. Close on the action required of the reader and on where to raise a problem: a named person, role or channel. Do NOT write it as a request or a proposal; no "could you please", no "if possible", no asking for agreement. Do NOT leave the effective date vague — "soon", "as early as possible" and "in the coming days" are not acceptable. If the requirements give no date, say the effective date will be confirmed and name who will confirm it.`,

  Custom: `GOAL — none. Impose no document shape of your own: do not add an escalation, a root cause, a deadline, a question or a directive that the requirements did not ask for. Follow the audience, tone, length and document-shape instructions alone, and keep the requirements' own moves in the requirements' own order.`
};

/**
 * The format axis: the message's shape, independent of the goal above.
 *
 * Kept strictly separate because the branch this replaces keyed the
 * "technical guide" layout off `goal.includes('explain')` as well as off the
 * format, so picking the Explain preset silently overrode whatever document
 * shape the user had chosen. Goal decides the content and the moves; format
 * decides the packaging, and nothing else may touch it.
 *
 * The email branch's leading subject line is load-bearing, not decoration:
 * useComposeTab.ts peels line 1 off into its own Subject field, and only
 * when `format === 'formal_email'`. It matches a bare `subject:` prefix, so
 * the bolded `**Subject:**` this used to ask for never matched and the
 * marker was shown to the sender as part of the body.
 */
const FORMAT_SHAPES: Record<string, string> = {
  formal_email: `DOCUMENT SHAPE — FORMAL EMAIL.
Line 1 of your output MUST be the subject line, in exactly this form and with nothing whatsoever before it — no bold markers, no quotes, no leading spaces:
Subject: <a concise, specific subject in the target language>
Then a blank line, a salutation matched to the audience, body paragraphs separated by blank lines, and a professional closing with a sign-off. The subject line and the sign-off do not count against the length budget.`,

  action_list: `DOCUMENT SHAPE — ACTION LIST.
Do NOT write a subject line, and do NOT write a salutation or a sign-off. One short framing sentence, then the content as a numbered or bulleted list: one action per item, each carrying its owner and its deadline where the requirements supply them. After the last item, add nothing but the single closing line the goal contract calls for, if it calls for one.`,

  wechat_zalo: `DOCUMENT SHAPE — GROUP-CHAT MESSAGE (WeChat / Zalo).
Do NOT write a subject line, a salutation block or a sign-off. Write one message a supervisor can take in on a phone in a few seconds: at most three short paragraphs, or short bullets where the content really is a list. Prefer a line break to a long sentence.`
};

/**
 * Word budgets per length. Every combination used to share one flat
 * `Max 200 words` cap, which made the length control decorative — and made
 * the detailed presets (Explain writes to a brand client) cut off mid
 * root-cause. The three ranges do not overlap so the setting is visible in
 * the output.
 */
const LENGTH_BUDGETS: Record<string, string> = {
  short: 'LENGTH: 60-110 words. One idea per sentence. Cut every word that is not a fact, a number, a name or an instruction.',
  standard: 'LENGTH: 130-220 words. Enough room for the full goal contract and nothing beyond it — no restating, no closing summary paragraph.',
  detailed: 'LENGTH: 280-420 words. Spend the room on specifics — parameters, quantities, dates, named owners — never on filler, on background the reader already has, or on the same point made twice in different words.'
};

/**
 * Register per audience. A brand client, a director, a peer department, a
 * line worker and an outside expert are five different registers; the prompt
 * this replaces passed the raw token through and left the model to guess,
 * so every audience came out in the same mid-formal voice.
 */
const AUDIENCE_REGISTERS: Record<string, string> = {
  brand_client: 'AUDIENCE: a brand customer outside the company (adidas and the like). Full formal register, with the honorifics the target language uses towards a customer. Speak as the factory ("we"), never as an aggrieved individual. No internal shorthand — line nicknames, internal department codes, floor slang for a defect — unless you spell it out. Never name another customer, another order or another factory, and never blame a named person inside our own organisation.',
  top_management: 'AUDIENCE: our own senior management — a director, GM or plant head. Conclusion first, supporting facts second: they decide, they do not need the process explained to them. Respectful but compact. Numbers, dates, and the decision you need from them; no tutorial, no padding.',
  cross_dept: 'AUDIENCE: a peer department (QA, IE, Planning, Warehouse, Purchasing). Colleague to colleague: plain "we" and "you", no deference and no commanding. Say what you need from them and what you will do on your own side.',
  subordinates: 'AUDIENCE: line leaders and operators on the floor. Short sentences and concrete verbs. Use the shop-floor word the target language actually uses, not a management abstraction and not an untranslated English loanword. Say exactly what to do, in what order, and by when.',
  expert: 'AUDIENCE: an outside specialist or consultant. Peer-to-peer technical register: exact parameter names with their units, no explanation of basics they already know, no sales or PR gloss, and no deference so thick it buries the question.'
};

const TONE_LINES: Record<string, string> = {
  professional: 'TONE: neutral and professional. Factual, with no emotional colouring in either direction.',
  strict_urgent: 'TONE: strict and urgent. The time pressure must be audible in the first sentence. No hedging ("maybe", "a bit", "when convenient") and no softening of the deadline. Firm, but never rude and never accusatory.',
  collaborative: 'TONE: collaborative. Frame it as a shared problem with a shared fix: acknowledge the other side\'s constraint in one clause, then state your part and theirs.',
  persuasive: 'TONE: persuasive. Lead with the reason this reader should care — their risk, their cost, their delivery date — and back every claim with a fact taken from the requirements, never with pressure or flattery.',
  humble: 'TONE: humble and deferential. Modest phrasing and the target language\'s polite forms — but do not go vague with it: the facts, the numbers and the ask stay exactly as concrete as they would be in any other tone.'
};

/** What the Compose tab puts on the wire, one field per control (src/constants.ts). */
export interface ComposePromptInput {
  /**
   * A ComposeGoal token ('Report' … 'Custom'). Matched case-insensitively
   * and falling back to Custom, because a client cached from before the goal
   * tokens existed sends the lower-cased preset id — or, older still,
   * nothing at all — and an unmatched goal must degrade to "no shape
   * imposed" rather than to an empty branch.
   */
  goal?: string;
  audience?: string;
  tone?: string;
  length?: string;
  format?: string;
  lang: string;
  /** The client's pre-built `[{term, translation}]` JSON string, or '' / undefined for none — see src/services/glossary.ts. */
  glossary?: string;
}

/**
 * Builds /compose's system prompt. Pure and exported for the same reason
 * buildTranslateSystemPrompt above is: the goal x format x language x length
 * matrix has to be assertable without an OPENAI_API_KEY or an HTTP request
 * (see repo memory.md §6).
 *
 * Prose to a model rather than the pseudo-XML block it replaces
 * (`ROLE: Industrial_Proxy_Writer`, `<transformation_logic>`,
 * `<mandatory_workflow>`): the tag soup read as a schema the model was meant
 * to fill rather than as instructions, and its `<execution_flow>` still told
 * the model to detect intent from "Context + Requirements" long after the
 * context plumbing was removed — an instruction to weigh something that is
 * never sent, next to a constraint forbidding it to ask about it.
 */
export function buildComposeSystemPrompt(input: ComposePromptInput): string {
  // Defensive rather than trusting the declared types: every field here comes
  // straight off `req.body.params`, which is `any`, and an old client can
  // omit any of them. Falling back to the Custom preset's own defaults keeps
  // a partial body producing a sane message instead of "Write in undefined".
  const { mappedLang, scriptRule } = resolveLanguage(String(input.lang ?? '').trim() || 'English');

  const goalKey = String(input.goal ?? '').trim().toLowerCase();
  const goal = COMPOSE_GOAL_TOKENS.find(token => token.toLowerCase() === goalKey) ?? 'Custom';

  const formatShape = FORMAT_SHAPES[String(input.format ?? '').trim()] ?? FORMAT_SHAPES.wechat_zalo;
  const lengthBudget = LENGTH_BUDGETS[String(input.length ?? '').trim()] ?? LENGTH_BUDGETS.standard;
  const audienceRegister = AUDIENCE_REGISTERS[String(input.audience ?? '').trim()] ?? AUDIENCE_REGISTERS.cross_dept;
  const toneLine = TONE_LINES[String(input.tone ?? '').trim()] ?? TONE_LINES.professional;

  // Omitted entirely when empty, not stubbed with "No specific glossary
  // provided.": a placeholder still reads as a section the model should
  // reason about, and '[]' is what the client sends when nothing matched.
  const glossaryText = (input.glossary ?? '').trim();
  const hasGlossary = glossaryText.length > 0 && glossaryText !== '[]';
  const glossarySection = hasGlossary
    ? `\n\nGLOSSARY — mandatory term overrides (JSON array of {term, translation} pairs matched against the sender's note):
${glossaryText}
These translations are REQUIRED and override your own default wording. A \`term\` still applies when it appears inflected, pluralised, capitalised differently, or embedded inside a longer compound word or phrase — recognise it in any of those forms and use the paired \`translation\` verbatim. Do not substitute a synonym, and do not skip a term because its surface form does not match the entry exactly.`
    : '';

  return `ROLE: You are the ghostwriter for a production and quality manager at a Vietnamese footwear factory. They hand you a rough note — typed in a hurry, in whatever language came to hand — and you return the finished message they will send. It goes out as-is, with no editing.

TARGET LANGUAGE: Write the entire message in ${mappedLang}. Zero leakage of the language the note happens to be written in: no stray source-language word, no parenthetical original, no bilingual gloss.${scriptRule ? `\n${scriptRule}` : ''}

${audienceRegister}

${toneLine}

${lengthBudget}

${GOAL_CONTRACTS[goal]}

${formatShape}

RULES (in order; each governs its own, non-overlapping category):
1. You are the sender, writing in their first person. The output IS the message, addressed to the reader described under AUDIENCE. Never address the sender, never acknowledge or restate their note, never offer them variants or ask them to choose. Where a goal contract tells you to ask for a missing fact, that question is addressed to the recipient, inside the message.
2. Model numbers, article and item codes, machine and mould IDs, brand names and "@name" mentions are copied exactly as written — never translated, transliterated or reformatted. Numeric measurements and their units (mm, kg, %, pairs, pcs, °C, times) are copied exactly; only the quantifier words around them are written in the target language.
3. Invent nothing. No quantity, date, person, cause, root cause or commitment that the note does not contain. Where a goal contract needs a fact the note does not supply, either ask the recipient for it or leave a visible blank for the sender to fill — never fill it yourself with a plausible-looking value.
4. Any term matching a GLOSSARY entry is mandatory-overridden by that entry (see GLOSSARY below for the full contract, including inflected and compound forms).
5. Use bold (\`**...**\`) only on the load-bearing details a reader must not miss — line numbers, item codes, quantities, deadlines, the person responsible. Bolding a whole paragraph bolds nothing.${glossarySection}

OUTPUT CONTRACT: Return ONLY the finished message in ${mappedLang}, ready to paste as-is. No preamble, no sign of your reasoning, no alternatives, no labels beyond the ones DOCUMENT SHAPE requires, and no markdown code fences.`;
}

router.post('/compose', async (req, res) => {
  if (!OPENAI_API_KEY) {
    console.error("Missing OPENAI_API_KEY in environment.");
    return res.status(500).json({ error: "Server Configuration Error" });
  }

  const { requirements, params, glossary } = req.body;

  // Requirements are the whole user turn now that the conversation context is
  // gone, so an empty one would send the model a system prompt and nothing to
  // rewrite. A client cached from before that change can still post a
  // context-only compose, which used to be legal.
  if (!requirements || !String(requirements).trim()) {
    return res.status(400).json({ error: "Missing requirements" });
  }

  try {
    // One normalisation of the language for both the prompt and the log row.
    // resolveLanguage() is the same one /translate uses above rather than a
    // second copy of that if-chain: this route used to have its own and it
    // disagreed with /translate's about which languages got script
    // enforcement at all (Indonesian, Burmese and Vietnamese got none here).
    // Only the display name is wanted out here — buildComposeSystemPrompt
    // resolves the script rule it needs itself.
    const lang = String(params?.lang ?? '').trim() || 'English';
    const { mappedLang } = resolveLanguage(lang);

    const systemPrompt = buildComposeSystemPrompt({
      goal: params?.goal,
      audience: params?.audience,
      tone: params?.tone,
      length: params?.length,
      format: params?.format,
      lang,
      glossary
    });

    const targetModel = req.body.model || APP_ENGINE_ID;
    const response = await createChatCompletion(
      getOpenAI(),
      {
        model: targetModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: requirements }
        ],
      },
      tuningFor(targetModel, 'compose')
    );

    const outputText = response.choices[0].message.content;

    // Non-blocking log to Supabase
    logToSupabase({
      task_type: 'compose',
      input_text: requirements,
      output_text: outputText,
      from_lang: 'auto',
      to_lang: mappedLang,
      ip_address: (req as any).clientIp
    });

    res.json({ generatedReply: outputText });
  } catch (error: any) {
    console.error('Compose error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Compose failed', details: error.message });
  }
});

router.post('/import-vocab', async (req, res) => {
  try {
    let csvData: string;
    try {
      console.log(`Starting sync from Google Sheet: ${GOOGLE_SHEET_ID}`);
      const sheetUrl = `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/gviz/tq?tqx=out:csv`;
      console.log("Fetching from URL:", sheetUrl);
      const response = await axios.get(sheetUrl, { timeout: 10000 });
      if (!response.data) {
        throw new Error('Empty response from Google Sheets');
      }
      csvData = response.data;
    } catch (sheetError: any) {
      console.warn("Failed to fetch from Google Sheets, trying local fallback:", sheetError.message);
      try {
        const localPath = path.join(process.cwd(), 'Vocabulary Library.csv');
        csvData = fs.readFileSync(localPath, 'utf-8');
        console.log("Successfully read local Vocabulary Library.csv fallback.");
      } catch (fsError: any) {
        console.error("Local CSV fallback also failed:", fsError.message);
        throw sheetError;
      }
    }

    const parsed = Papa.parse(csvData, {
      header: true,
      skipEmptyLines: true,
      transformHeader: normalizeHeader
    });

    const rawData = parsed.data;
    if (rawData.length === 0) {
      return res.json({ message: 'No data found in Google Sheet', count: 0, data: [] });
    }

    // VocabItem's shape lives in shared/vocabNormalize.ts — kept in one place
    // because it used to drift between this route and import-vocab.ts.
    const sanitizedData = (rawData as Record<string, any>[])
      .map((item) => {
        const fields = extractVocabRow(item);
        const id = crypto.createHash('md5').update(vocabHashKey(fields)).digest('hex');
        return { id, ...fields };
      })
      .filter(hasSourcePhrase);

    if (sanitizedData.length === 0) {
      return res.json({ message: 'No valid items found after filtering', count: 0, data: [] });
    }

    res.json({ 
      status: 'success',
      message: `Successfully synced ${sanitizedData.length} items from Google Sheets`, 
      count: sanitizedData.length,
      data: sanitizedData,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Import error:', error.message);
    
    let errorMessage = 'Internal Server Error';
    let statusCode = 500;
    
    if (error.response && error.response.status === 404) {
      errorMessage = 'Không tìm thấy file Google Sheets. Vui lòng kiểm tra ID hoặc quyền chia sẻ';
      statusCode = 404;
    }

    res.status(statusCode).json({ error: errorMessage, details: error.message });
  }
});

router.post('/feedback', async (req, res) => {
  try {
    const { content, lang } = req.body || {};
    console.log('Received feedback:', { content, lang });

    if (supabase) {
      const { error } = await supabase
        .from('user_feedbacks')
        .insert([{ content, interface_lang: lang, created_at: new Date().toISOString() }] as any);
        
      if (error) {
        console.error('Supabase error:', error);
        return res.status(500).json({ error: 'Failed to save feedback to database' });
      }
    } else {
      console.warn('Supabase credentials not configured. Logging feedback only.');
    }
    
    res.status(200).json({ message: 'Feedback received successfully!' });
  } catch (err: any) {
    console.error('Feedback error:', err);
    res.status(500).json({ error: 'Failed to process feedback', details: err.message });
  }
});

router.post('/expert-search', async (req, res) => {
  try {
    const { message } = req.body || {};
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const systemPrompt = "Bạn là một chuyên gia kỹ thuật lão làng với 30 năm kinh nghiệm trong ngành sản xuất giày da, am hiểu sâu sắc về Lean, cơ lý vật liệu, hóa chất ngành giày (Keo, xử lý bề mặt Outsole/Upper), tiêu chuẩn SOP, thử nghiệm chất lượng (SATRA, ISO) và các điểm kiểm soát CTQ.";
    const targetModel = req.body.model || APP_ENGINE_ID;
    const searchMessages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: message }
    ];

    let response;
    try {
      response = await createChatCompletion(
        getOpenAI(),
        { model: targetModel, messages: searchMessages, tools: [{ type: "web_search" }] as any },
        tuningFor(targetModel, 'expert-search')
      );
    } catch (searchError: any) {
      console.warn("Web search failed or quota exceeded. Falling back to offline knowledge.", searchError.message);
      response = await createChatCompletion(
        getOpenAI(),
        { model: targetModel, messages: searchMessages },
        tuningFor(targetModel, 'expert-search')
      );
    }

    const responseMessage = response.choices[0].message;
    
    // Non-blocking log to Supabase
    logToSupabase({
      task_type: 'expert_search',
      input_text: message,
      output_text: responseMessage.content,
      from_lang: 'auto',
      to_lang: 'vi',
      ip_address: (req as any).clientIp
    });

    res.json({ reply: responseMessage.content, annotations: (responseMessage as any).annotations || [] });
  } catch (error: any) {
    console.error('Expert search error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Expert search failed', details: error.message });
  }
});

router.get('/security-rules', async (req, res) => {
  if (!supabase) {
    return res.json({ pattern_text: '' });
  }
  try {
    const { data, error } = await (supabase as any)
      .from('security_rules')
      .select('pattern_text')
      .order('id', { ascending: false })
      .limit(1);
    if (error) throw error;
    if (data && data.length > 0) {
      return res.json({ pattern_text: data[0].pattern_text });
    }
    return res.json({ pattern_text: '' });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch security rules' });
  }
});

router.post('/security-analyze', async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'Missing text' });

  try {
    const targetModel = req.body.model || APP_ENGINE_ID;
    const response = await createChatCompletion(
      getOpenAI(),
      {
        model: targetModel,
        messages: [
          {
            role: 'system',
            content: 'You are a security AI. Analyze the following spam/attack text. Return a JSON object with {"keywords": ["keyword1", "keyword2"]} that are most indicative of this spam.'
          },
          { role: 'user', content: text }
        ],
      },
      tuningFor(targetModel, 'security-analyze')
    );

    const result = JSON.parse(response.choices[0].message.content || '{"keywords":[]}');
    
    if (supabase && result.keywords && result.keywords.length > 0) {
      try {
        const { data: ruleData } = await (supabase as any)
          .from('security_rules')
          .select('*')
          .order('id', { ascending: false })
          .limit(1);

        if (ruleData && ruleData.length > 0) {
          const currentPattern = ruleData[0].pattern_text;
          const newKeywords = result.keywords.filter((kw: string) => kw && kw.trim() && !currentPattern.includes(kw.trim()));
          if (newKeywords.length > 0) {
            const updatedPattern = `${currentPattern}|${newKeywords.map((kw: string) => kw.trim()).join('|')}`;
            await (supabase as any)
              .from('security_rules')
              .update({ pattern_text: updatedPattern, updated_at: new Date().toISOString() })
              .eq('id', ruleData[0].id);
          }
        } else {
          await (supabase as any)
              .from('security_rules')
              .insert([{ pattern_text: result.keywords.map((kw: string) => kw.trim()).join('|'), updated_at: new Date().toISOString() }] as any);
        }
      } catch (dbErr) {
        console.error('Failed to update security_rules table:', dbErr);
      }
    }

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: 'Analysis failed' });
  }
});

router.get('/vocab', (req, res) => {
  res.status(410).json({ error: 'Database removed. Please use client-side localStorage and /api/import-vocab to sync.' });
});

// LƯU Ý: presence được giữ trong RAM của tiến trình. Netlify Functions là
// stateless (mỗi cold start bắt đầu lại từ 0, nhiều instance không chia sẻ
// Map), nên số người online chỉ chính xác trên Render server chạy liên tục.
// Các route dưới đây tồn tại để dashboard vẫn hoạt động khi
// VITE_RENDER_SERVER_URL trống và app chạy thuần trên Netlify.

router.post('/presence/ping', (req, res) => {
  const { sessionId } = req.body || {};
  if (typeof sessionId !== 'string' || sessionId.trim() === '') {
    return res.status(400).json({ error: 'Missing or invalid sessionId' });
  }
  res.json({ online: recordHeartbeat(sessionId.trim()) });
});

// requireAdmin gates this and /admin/responses: the latter returns real user
// text out of app_logs, and both used to answer anyone who knew the URL.
router.get('/admin/metrics', requireAdmin, async (req, res) => {
  const online = countOnline();
  if (!supabase) {
    return res.json({ online, totalRequests: 0, supabaseConfigured: false });
  }
  try {
    res.json({ online, totalRequests: await countTotalRequests(supabase), supabaseConfigured: true });
  } catch (error: any) {
    console.error('Failed to fetch admin metrics:', error);
    res.json({ online, totalRequests: 0, supabaseConfigured: true });
  }
});

router.get('/admin/responses', requireAdmin, async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Supabase not configured' });
  try {
    res.json({ responses: await fetchRecentResponses(supabase, req.query.limit) });
  } catch (error: any) {
    console.error('Failed to fetch recent responses:', error);
    res.status(500).json({ error: 'Failed to fetch recent responses' });
  }
});

router.all('*', (req, res) => {
  res.status(404).json({ error: `API route not found: ${req.method} ${req.url}` });
});

app.use('/api', router);
app.use('/.netlify/functions/api', router);
app.use('/', router);

export const handler = serverless(app);
