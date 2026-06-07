// Pure, dependency-free RSS parser — extracts up to maxItems <item> blocks.
// Handles <![CDATA[...]]> wrappers and HTML entity decoding.

const ENTITY_MAP = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
};

function decodeEntities(str) {
  return str.replace(/&(?:amp|lt|gt|quot|#39|apos);/g, (m) => ENTITY_MAP[m] ?? m);
}

function extractCdata(raw) {
  // Unwrap <![CDATA[...]]> if present, otherwise return trimmed text.
  const cdataMatch = raw.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  return cdataMatch ? cdataMatch[1] : decodeEntities(raw.trim());
}

function extractField(block, tag) {
  // Match both <tag>...</tag> and self-closing variants; handle CDATA.
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = block.match(re);
  if (!m) return '';
  return extractCdata(m[1].trim());
}

/**
 * Parse an RSS 2.0 XML string and return an array of item objects.
 * @param {string} xml - Raw RSS XML text
 * @param {number} [maxItems=15] - Maximum number of items to return
 * @param {string} [source='Yahoo Finance'] - Source label attached to each item
 * @returns {{ title: string, link: string, pubDate: string, source: string }[]}
 */
export function parseRss(xml, maxItems = 15, source = 'Yahoo Finance') {
  const items = [];
  // Split on <item ...> boundaries; skip first segment (channel header).
  const itemRe = /<item[\s>]([\s\S]*?)<\/item>/gi;
  let match;

  while ((match = itemRe.exec(xml)) !== null && items.length < maxItems) {
    const block = match[1];
    const title = extractField(block, 'title');
    const link = extractField(block, 'link') || extractField(block, 'guid');
    const pubDate = extractField(block, 'pubDate');

    items.push({ title, link, pubDate, source });
  }

  return items;
}
