let gotScraping;

async function getChapters(comickUrl) {
  if (!comickUrl) return[];
  try {
    if (!gotScraping) { const module = await import('got-scraping'); gotScraping = module.gotScraping; }
    
    const slug = comickUrl.split('/').pop();
    
    // 1. Get the secret "hid" required for ComicK chapters
    const infoRes = await gotScraping({ url: `https://api.comick.io/comic/${slug}` });
    const hid = JSON.parse(infoRes.body).comic.hid;

    // 2. Fetch all chapters
    const chRes = await gotScraping({ url: `https://api.comick.io/comic/${hid}/chapters?lang=en&limit=9999` });
    const chapters = JSON.parse(chRes.body).chapters;

    return chapters.map((c) => {
      const num = c.chap || '0';
      return {
        ch_title: `Chapter ${num} (ComicK)`,
        chapter_number: num,
        slug: `comick_${c.hid}`, // Tag it so the reader knows to fetch ComicK images
        time: c.created_at || '',
        provider: 'ComicK'
      };
    });
  } catch (err) {
    console.error("[COMICK] Error fetching chapters:", err.message);
    return[];
  }
}

async function searchAndGetChapters(title) {
  try {
    if (!gotScraping) { const module = await import('got-scraping'); gotScraping = module.gotScraping; }
    const searchRes = await gotScraping({ url: `https://api.comick.io/v1.0/search?q=${encodeURIComponent(title)}&limit=1` });
    const data = JSON.parse(searchRes.body);
    
    if (data.length > 0) {
      const hid = data[0].hid;
      const chRes = await gotScraping({ url: `https://api.comick.io/comic/${hid}/chapters?lang=en&limit=9999` });
      const chapters = JSON.parse(chRes.body).chapters;
      return chapters.map((c) => ({
        ch_title: `Chapter ${c.chap || '0'} (ComicK)`, chapter_number: c.chap || '0',
        slug: `comick_${c.hid}`, time: c.created_at || '', provider: 'ComicK'
      }));
    }
    return [];
  } catch (e) { return
