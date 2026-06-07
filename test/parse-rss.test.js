import { describe, it, expect } from 'vitest';
import { parseRss } from '../lib/parse-rss.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const normalFeed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Yahoo Finance</title>
    <item>
      <title>Apple beats earnings expectations</title>
      <link>https://finance.yahoo.com/news/apple-beats-earnings-1</link>
      <pubDate>Mon, 02 Jun 2026 14:00:00 GMT</pubDate>
    </item>
    <item>
      <title>Apple unveils new product line</title>
      <link>https://finance.yahoo.com/news/apple-new-product-2</link>
      <pubDate>Tue, 03 Jun 2026 09:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

const cdataFeed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <item>
      <title><![CDATA[Apple's stock surges 5% after earnings]]></title>
      <link><![CDATA[https://finance.yahoo.com/news/apple-surge-cdata]]></link>
      <pubDate>Wed, 04 Jun 2026 10:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

const entityFeed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <item>
      <title>Apple &amp; Microsoft battle for market cap &lt;lead&gt;</title>
      <link>https://finance.yahoo.com/news/apple-msft-entity</link>
      <pubDate>Thu, 05 Jun 2026 08:00:00 GMT</pubDate>
    </item>
    <item>
      <title>Q2 earnings: &quot;record revenue&quot; says CEO</title>
      <link>https://finance.yahoo.com/news/q2-earnings-quote</link>
      <pubDate>Fri, 06 Jun 2026 07:30:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

const emptyFeed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Yahoo Finance</title>
  </channel>
</rss>`;

// Generate a feed with 20 items to test the 15-item cap.
function makeBigFeed(count) {
  const items = Array.from(
    { length: count },
    (_, i) => `
    <item>
      <title>News item ${i + 1}</title>
      <link>https://finance.yahoo.com/news/item-${i + 1}</link>
      <pubDate>Mon, 02 Jun 2026 ${String(i).padStart(2, '0')}:00:00 GMT</pubDate>
    </item>`
  ).join('');
  return `<rss version="2.0"><channel>${items}</channel></rss>`;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('parseRss', () => {
  describe('normal feed', () => {
    it('returns all items', () => {
      const items = parseRss(normalFeed);
      expect(items).toHaveLength(2);
    });

    it('extracts title, link, pubDate, source', () => {
      const [first] = parseRss(normalFeed);
      expect(first.title).toBe('Apple beats earnings expectations');
      expect(first.link).toBe('https://finance.yahoo.com/news/apple-beats-earnings-1');
      expect(first.pubDate).toBe('Mon, 02 Jun 2026 14:00:00 GMT');
      expect(first.source).toBe('Yahoo Finance');
    });
  });

  describe('CDATA titles and links', () => {
    it('unwraps CDATA wrappers', () => {
      const [item] = parseRss(cdataFeed);
      expect(item.title).toBe("Apple's stock surges 5% after earnings");
      expect(item.link).toBe('https://finance.yahoo.com/news/apple-surge-cdata');
    });
  });

  describe('entity-laden titles', () => {
    it('decodes &amp;', () => {
      const [item] = parseRss(entityFeed);
      expect(item.title).toContain('Apple & Microsoft');
    });

    it('decodes &lt; and &gt;', () => {
      const [item] = parseRss(entityFeed);
      expect(item.title).toContain('<lead>');
    });

    it('decodes &quot;', () => {
      const items = parseRss(entityFeed);
      expect(items[1].title).toContain('"record revenue"');
    });
  });

  describe('empty feed', () => {
    it('returns an empty array', () => {
      expect(parseRss(emptyFeed)).toHaveLength(0);
    });
  });

  describe('max items cap', () => {
    it('returns at most 15 items from a 20-item feed', () => {
      const items = parseRss(makeBigFeed(20));
      expect(items).toHaveLength(15);
    });

    it('returns all items when feed has fewer than 15', () => {
      const items = parseRss(makeBigFeed(5));
      expect(items).toHaveLength(5);
    });
  });
});
