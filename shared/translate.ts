import {
  APP_ENGINE_ID,
  getAnthropic,
  imageBlock,
  resolveModel,
  streamText,
} from './modelConfig';
import { logToSupabase } from './appLogs';

/*
 * /translate, shared by its two hosts so they cannot drift apart:
 *  - netlify/functions/translate.mts (a modern Netlify function, so the
 *    answer streams to the browser; the Lambda-style api.ts handler buffers
 *    the whole response), and
 *  - the Express router in netlify/functions/api.ts, which server.ts serves
 *    on Render.
 */

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
export function resolveLanguage(lang: string): { mappedLang: string; scriptRule: string } {
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
 * glossary x summarize matrix can be exercised without booting a Claude
 * client or an HTTP request (ANTHROPIC_API_KEY is not available in every
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

/** The JSON body the client (src/services/ai.ts) posts to /api/translate. */
export interface TranslateRequest {
  text?: string;
  targetLang?: string;
  glossary?: string;
  image?: string;
  summarize?: boolean;
  model?: string;
}

/**
 * Starts a streamed translation. Resolves once Claude has accepted the
 * request (so auth/validation errors surface before any response bytes are
 * written) with an iterable of text chunks.
 */
export async function startTranslation(body: TranslateRequest): Promise<AsyncIterable<string>> {
  const { text, targetLang, glossary, image, summarize } = body ?? {};
  const systemPrompt = buildTranslateSystemPrompt({ targetLang, glossary, summarize });

  // A single user message: the typed text, then the image and its instruction.
  const userContent: any[] = [];
  const hasText = !!text && text.trim() !== '';
  if (hasText) userContent.push({ type: 'text', text });
  if (image) {
    const imageInstruction = hasText
      ? "\n\n[IMAGE INSTRUCTION]: Additionally, extract and translate any text found in the attached image. Preserve the original layout, tables, and line breaks. You MUST apply the Glossary and Rules to the extracted text."
      : "[IMAGE INSTRUCTION]: Extract and translate all visible text in this image. Preserve the original layout, bullet points, and line breaks. Strictly follow the System Rules and Glossary above for the translation.";
    userContent.push({ type: 'text', text: imageInstruction });
    userContent.push(imageBlock(image));
  }

  return streamText(getAnthropic(), 'translate', {
    model: resolveModel(body?.model || APP_ENGINE_ID),
    system: systemPrompt,
    messages: [{ role: 'user', content: userContent }],
  });
}

/** Records a finished translation in app_logs. Never throws. */
export function logTranslation(body: TranslateRequest, outputText: string, ipAddress?: string): Promise<void> {
  return logToSupabase({
    task_type: 'translate',
    input_text: body?.text || '[Image only]',
    output_text: outputText,
    from_lang: 'auto',
    to_lang: body?.targetLang,
    ip_address: ipAddress,
  });
}
