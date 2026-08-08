const WORDS_PER_MINUTE = 200;

/**
 * Strip HTML tags so markup isn't counted as words.
 *
 * The frontend's previous implementation ran the word count over the raw
 * richtext HTML, so every tag, attribute and class name inflated the total.
 * Read times shown on the site were therefore consistently too high — expect
 * numbers to drop once this is backfilled.
 */
export function htmlToText(html?: string | null): string {
  return String(html ?? "")
    // drop script/style bodies entirely
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    // collapse the most common entities to a single character
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Read time in whole minutes. Always at least 1 for non-empty content, and 0
 * for empty content so the frontend can distinguish "not computed" from "very
 * short".
 */
export function calculateReadTime(content?: string | null): number {
  const text = htmlToText(content);
  if (!text) return 0;

  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}
