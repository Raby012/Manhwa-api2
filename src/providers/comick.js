let gotScraping;

// Reusable fetch init
async function getClient() {
  if (!gotScraping) {
    const module = await import('got-scraping');
    gotScraping = module.gotScraping;
  }
  return gotScraping;
}

// Safe JSON parser
function safeParse(body) {
  try {
    return typeof body === "string" ? JSON.parse(body) : body;
  } catch {
    return null;
  }
}

// Extract slug safely
function extractSlug(url) {
  if (!url) return null;
  const parts = url.split('/').filter(Boolean);
  return parts[parts.length - 1];
}

// =============================
// MAIN CHAPTER FETCH
// =============================
async function getChapters(comickUrl) {
  try {
    const client = await getClient();

    const slug = extractSlug(comickUrl);
    if (!slug) return [];

    // 1. Get HID
    const infoRes = await client({
      url: `https://api.comick.io/comic/${slug}`,
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json"
      }
    });

    const info = safeParse(infoRes.body);
    const hid = info?.comic?.hid;
    if (!hid) return [];

    // 2. Get chapters
    const chRes = await client({
      url: `https://api.comick.io/comic/${hid}/chapters?lang=en&limit=9999&tachiyomi=true`,
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json"
      }
    });

    const data = safeParse(chRes.body);
    const chapters = data?.chapters || [];

    return chapters.map((c) => ({
      ch_title: `Chapter ${c.chap || '0'} (ComicK)`,
      chapter_number: c.chap || '0',
      slug: `comick_${c.hid}`,
      time: c.created_at || '',
      provider: 'ComicK'
    }));

  } catch (err) {
    console.error("[COMICK] getChapters error:", err.message);
    return [];
  }
}

// =============================
// SEARCH + FETCH
// =============================
async function searchAndGetChapters(title) {
  try {
    const client = await getClient();

    if (!title) return [];

    const cleanTitle = title
      .replace(/[^a-zA-Z0-9 ]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!cleanTitle) return [];

    const searchRes = await client({
      url: `https://api.comick.io/v1.0/search?q=${encodeURIComponent(cleanTitle)}&limit=3&tachiyomi=true`,
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json"
      }
    });

    const data = safeParse(searchRes.body);
    if (!Array.isArray(data) || data.length === 0) return [];

    // Try best match (first result)
    const hid = data[0]?.hid;
    if (!hid) return [];

    return await getChapters(`https://comick.io/comic/${hid}`);

  } catch (e) {
    console.error("[COMICK] search error:", e.message);
    return [];
  }
}
