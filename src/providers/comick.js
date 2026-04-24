let gotScraping;

// Load client
async function getClient() {
  if (!gotScraping) {
    const mod = await import('got-scraping');
    gotScraping = mod.gotScraping;
  }
  return gotScraping;
}

// ============================
// 1. GET CHAPTERS FROM URL
// ============================
async function getChapters(comickUrl) {
  if (!comickUrl) return [];

  try {
    const client = await getClient();

    const slug = comickUrl.split('/').filter(Boolean).pop();

    if (!slug) return [];

    // Step 1: get comic info
    const infoRes = await client({
      url: `https://api.comick.io/comic/${slug}`,
      headers: {
        "user-agent": "Mozilla/5.0",
        "accept": "application/json"
      }
    });

    const info = JSON.parse(infoRes.body);

    if (!info?.comic?.hid) {
      console.log("[COMICK] No HID found");
      return [];
    }

    const hid = info.comic.hid;

    // Step 2: get chapters
    const chRes = await client({
      url: `https://api.comick.io/comic/${hid}/chapters?lang=en&limit=500`,
      headers: {
        "user-agent": "Mozilla/5.0",
        "accept": "application/json"
      }
    });

    const data = JSON.parse(chRes.body);
    const chapters = data?.chapters || [];

    return chapters
      .map((c, i) => ({
        ch_title: `Chapter ${c.chap || i}`,
        chapter_number: c.chap || `${i}`,
        slug: `comick_${c.hid}`,
        time: c.created_at || '',
        provider: 'ComicK'
      }))
      .reverse(); // oldest → newest

  } catch (err) {
    console.error("[COMICK] Chapter Error:", err.message);
    return [];
  }
}

// ============================
// 2. SEARCH + FETCH
// ============================
async function searchAndGetChapters(title) {
  try {
    const client = await getClient();

    const searchRes = await client({
      url: `https://api.comick.io/v1.0/search?q=${encodeURIComponent(title)}&limit=3`,
      headers: {
        "user-agent": "Mozilla/5.0",
        "accept": "application/json"
      }
    });

    const results = JSON.parse(searchRes.body);

    if (!Array.isArray(results) || results.length === 0) {
      console.log("[COMICK] No search result:", title);
      return [];
    }

    // take best match
    const best = results[0];

    if (!best?.hid) return [];

    const chRes = await client({
      url: `https://api.comick.io/comic/${best.hid}/chapters?lang=en&limit=500`,
      headers: {
        "user-agent": "Mozilla/5.0",
        "accept": "application/json"
      }
    });

    const data = JSON.parse(chRes.body);
    const chapters = data?.chapters || [];

    return chapters
      .map((c, i) => ({
        ch_title: `Chapter ${c.chap || i}`,
        chapter_number: c.chap || `${i}`,
        slug: `comick_${c.hid}`,
        time: c.created_at || '',
        provider: 'ComicK'
      }))
      .reverse();

  } catch (e) {
    console.error("[COMICK] Search Error:", e.message);
    return []; // FIXED
  }
}

module.exports = {
  getChapters,
  searchAndGetChapters
};
