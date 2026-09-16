import { CopyFormat } from '../types';
import { formatForCopy } from './richText';

export const copyTextToClipboard = async (text: string): Promise<boolean> => {
  if (!text) return false;

  // Try standard clipboard API first
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      console.warn("navigator.clipboard.writeText failed, falling back:", e);
    }
  }

  // Fallback to execCommand
  return fallbackCopyText(text);
};

function fallbackCopyText(text: string): boolean {
  try {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    
    // Avoid scrolling to bottom
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.position = "fixed";
    textArea.style.opacity = "0";
    textArea.style.pointerEvents = "none";
    
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch (err) {
    console.error('Fallback copy failed:', err);
    return false;
  }
}

/**
 * Copies the model's answer the way the user asked for it in Settings.
 *
 * Under 'plain' two flavours go on the clipboard at once: `text/html`, which a
 * rich-text target (Word, Gmail, a desktop chat client built on a web view)
 * pastes as real bold, and `text/plain`, the same message with the Markdown
 * markers removed — which is what Zalo, WeChat and every other plain-text box
 * take, instead of the literal `**` they used to receive.
 *
 * `navigator.clipboard.write` is newer than `writeText` and is refused outside
 * a user gesture, so any failure falls back to the plain flavour alone.
 */
export const copyFormattedText = async (
  source: string,
  format: CopyFormat = 'plain'
): Promise<boolean> => {
  const { text, html } = formatForCopy(source, format);
  if (!text) return false;

  if (html && typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/plain': new Blob([text], { type: 'text/plain' }),
          'text/html': new Blob([html], { type: 'text/html' })
        })
      ]);
      return true;
    } catch (e) {
      console.warn('navigator.clipboard.write failed, falling back to plain text:', e);
    }
  }

  return copyTextToClipboard(text);
};
