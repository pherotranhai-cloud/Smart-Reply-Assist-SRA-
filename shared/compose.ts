import { COMPANY_CONTEXT, resolveLanguage } from './translate';

/*
 * /compose's prompt. Pure and exported so every preset, audience, tone,
 * length and format can be checked without a Claude client (see
 * compose.test.ts). The route itself lives in netlify/functions/api.ts.
 *
 * The client (src/hooks/useComposeTab.ts) sends the raw setting values from
 * src/constants.ts (e.g. audience 'top_management', tone 'strict_urgent') and
 * the preset as `goal` ('Report', 'Explain', 'Remind', 'Consult', 'Announce'
 * or 'Custom'). Each value is spelled out below as what it means for the
 * text, because the model writes better to a description than to an enum.
 */

export interface ComposeParams {
  lang: string;
  audience?: string;
  tone?: string;
  length?: string;
  format?: string;
  goal?: string;
}

/** What each preset (CORE_PRESETS in src/constants.ts) is for. */
const GOAL_GUIDE: Record<string, string> = {
  Report:
    'Report a problem upward: a defect, an incident, a delay or an abnormal result. Open with the problem in one line (what, where: line, model, order; how many or how much). Then the impact, the cause if the notes give it, what has already been done, and what is needed from the reader (a decision, support, approval), if anything. Facts before opinions.',
  Explain:
    'Explain a situation or a decision, typically to a brand customer: why a delay, a defect or a change happened. Acknowledge the issue briefly, give the cause as the notes state it, then the corrective and preventive actions with their timing, and close with a commitment or when the next update will come. Take responsibility where the notes do, without admitting more than they say and without blaming individuals.',
  Remind:
    'Remind someone about a pending task: what is pending, the deadline or why it matters now, and a clear request. Polite but unambiguous; end on the action and its deadline.',
  Consult:
    'Ask a specialist for an opinion or advice: the background in brief, what is known or has been tried (data, results), then the specific question or questions, at the end, so the reader knows exactly what to answer.',
  Announce:
    'Announce information or a new rule or arrangement to a team: what it is, from when, who is affected and what they must do. End with the instruction to implement it.',
  Custom: 'No fixed purpose: take the purpose from the notes.',
};

const AUDIENCE_GUIDE: Record<string, string> = {
  brand_client:
    "A brand customer's team (development, quality, sourcing). Courteous and formal, in the company's voice (we / chúng tôi / 我們); no internal jargon, no internal blame, and no promises the notes do not make.",
  top_management:
    'Senior managers or directors. Lead with the conclusion and its impact, use the numbers, say plainly what decision or support is needed. Respectful and brief.',
  cross_dept:
    'Colleagues in other departments. Cooperative and clear about who does what by when.',
  subordinates:
    'Team leaders and staff who report to the writer. Direct, simple words, one instruction per line, nothing they could read two ways.',
  expert:
    'A technical specialist. Precise technical terms and data; skip what an expert already knows.',
};

const TONE_GUIDE: Record<string, string> = {
  professional: 'Professional: neutral, polite and factual.',
  strict_urgent:
    'Strict and urgent: the problem, its impact and the required action and deadline come first; firm, with no softening, but not rude.',
  collaborative: "Collaborative: friendly, 'we' wording, inviting cooperation and thanking people for it.",
  persuasive:
    'Persuasive: argue for the request with the reasons, data and benefits in the notes, and answer the obvious objection.',
  humble: "Humble: modest and polite, acknowledging the reader's position or inconvenience; suits requests and apologies.",
};

const LENGTH_GUIDE: Record<string, string> = {
  short: 'Short: a few lines with only the essentials.',
  standard: 'Standard: a complete normal message, with no padding.',
  detailed:
    'Detailed: cover every point in the notes with the context the reader needs, in several paragraphs or sections if needed; still no filler.',
};

function formatGuide(format: string | undefined, lang: string): string {
  switch (format) {
    case 'formal_email':
      return `Formal email. The first line is "Subject: " followed by a short, specific subject in ${lang}; keep the word "Subject:" itself in English, because the app moves that line into its own subject field. Then a blank line, a salutation suited to the audience, the body in short paragraphs (bold only for key figures, deadlines and codes; bullets for lists of three or more), and a closing phrase natural in ${lang}. Do not write a name or signature block under it; the writer adds their own.`;
    case 'action_list':
      return 'Action list. One opening line with the purpose, then a numbered list with one action per item: what to do, who does it and by when, where the notes say so. An optional one-line close. Add short headings only if the actions fall into clearly separate groups, and write them in the output language.';
    case 'wechat_zalo':
    default:
      return 'Group chat message (Zalo, WeChat, Teams). No subject line and no email-style signature; a short address line ("Dear all", "Mọi người", "各位") is fine. Short lines and paragraphs, bullets for three or more items, bold only for the few things the reader must not miss (codes, quantities, deadlines, the person in charge). No headings.';
  }
}

/** Forms of address per output language, so each audience is addressed the way it expects. */
function addressGuide(mappedLang: string): string {
  if (mappedLang.startsWith('Vietnamese')) {
    return 'Pick Vietnamese pronouns for the audience and format: to superiors in chat usually em with anh/chị (or the title, e.g. Ban Giám đốc), in a formal email tôi/chúng tôi; to staff, anh/chị or the group (mọi người, các bạn); to customers chúng tôi with Quý khách / Quý công ty.';
  }
  if (mappedLang.startsWith('Chinese')) {
    return 'Use 您 and polite set phrases for managers and customers, and plain, friendly wording for colleagues and staff.';
  }
  return 'Use the forms of address and politeness this audience expects in the output language.';
}

/**
 * Builds /compose's system prompt from the request params and the client's
 * pre-built glossary JSON ('' or '[]' when there is none).
 */
export function buildComposeSystemPrompt(params: ComposeParams, glossary?: string | null): string {
  const { mappedLang, scriptRule } = resolveLanguage(params.lang || 'English');
  const goal = params.goal && GOAL_GUIDE[params.goal] ? params.goal : 'Custom';

  const settings = [
    `Purpose (${goal}): ${GOAL_GUIDE[goal]}`,
    `Audience: ${AUDIENCE_GUIDE[params.audience ?? ''] ?? AUDIENCE_GUIDE.cross_dept}`,
    `Tone: ${TONE_GUIDE[params.tone ?? ''] ?? TONE_GUIDE.professional}`,
    `Length: ${LENGTH_GUIDE[params.length ?? ''] ?? LENGTH_GUIDE.standard}`,
    `Format: ${formatGuide(params.format, mappedLang)}`,
  ].join('\n');

  const glossaryText = (glossary ?? '').trim();
  const glossarySection =
    glossaryText && glossaryText !== '[]'
      ? `\n\n<glossary>\n${glossaryText}\n</glossary>\nThese are the factory's approved ${mappedLang} terms for words in the notes. Use each \`translation\` wherever that term comes up, changing only capitalisation or grammatical form to fit the sentence.`
      : '';

  return `You write workplace texts on behalf of an employee of Lai Yih Group. ${COMPANY_CONTEXT}

The employee gives you notes in <my_notes>: what they want to say, often rough, in any language, sometimes typed without Vietnamese diacritics or dictated by voice. Sometimes they also give a message they received, in <incoming_message>. You turn this into the finished text, written in ${mappedLang} in the employee's own voice (first person), which they paste straight into their chat or email.

<what_to_write>
Usually the notes are the content of a message the employee wants to send; phrases such as "xin báo cáo", "thông báo" or "nhắc" only say what kind of message it is, written by the employee. Use every fact in the notes, and keep names, numbers, dates, codes, @mentions, URLs and file names exactly as given. When there is an incoming message, the text is the employee's reply to it, and it answers what that message asks.

Sometimes the notes ask for a different kind of text instead, often with a lead-in such as "prompt cho claude code" or "phản hồi bình luận": a prompt for an AI tool, a reply to a comment or an answer to a question pasted below, a name or expansion for an acronym. Write that text itself and leave the lead-in out. A prompt for an AI tool should be complete and ready to use: the goal, every requirement from the notes, and a clear structure (sections, deliverables, constraints) that makes the requirements easy to follow. When the text is not a message to people, apply the settings below only where they fit, and give it no subject line, greeting or sign-off.

Do not invent facts about real events and people: no dates, quantities, names, causes, handover arrangements, contacts or commitments that the notes do not support. Structure, wording and reasonable working instructions are not facts and are yours to add. Use a short placeholder in square brackets, in ${mappedLang} (such as [ngày] or [date]), only for a detail the text cannot be sent without, such as the date of a leave request; anything else the notes leave out stays out. Add only what the text needs to read naturally, such as a greeting, a linking sentence or a closing thank-you.
</what_to_write>

<settings>
${settings}
</settings>

<language>
Write the whole text in ${mappedLang}, whatever language the notes are in.${scriptRule ? ` ${scriptRule}` : ''} Only codes, model and brand names, @mentions, URLs and file names stay as written. Use the punctuation of the output language (full-width ，。：！？ in Chinese). Keep Vietnamese personal names in their Vietnamese spelling (anh Hải stays Hải, not a translation or a Chinese nickname). ${addressGuide(mappedLang)} Use the footwear terms people in the factory actually use.
</language>${glossarySection}

Output only the finished text, in Markdown as the format describes: no explanation, no alternatives, and no code fence around the whole text (code blocks inside a prompt for an AI tool are fine).`;
}

/** The user message: the received message (if any) and the employee's notes, each in its own tags. */
export function buildComposeUserMessage(contextText?: string | null, requirements?: string | null): string {
  const incoming = (contextText ?? '').trim();
  const notes = (requirements ?? '').trim();
  const parts: string[] = [];
  if (incoming) parts.push(`<incoming_message>\n${incoming}\n</incoming_message>`);
  parts.push(
    notes
      ? `<my_notes>\n${notes}\n</my_notes>`
      : '<my_notes>\n(No notes: write my reply to the incoming message.)\n</my_notes>',
  );
  return parts.join('\n\n');
}
