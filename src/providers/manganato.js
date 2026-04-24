const cheerio = require('cheerio');
let gotScraping;

// 1. The Main Chapter Fetcher
async function getChapters(manganatoUrl) {
  if (!manganatoUrl) return[];

  try {
    if (!gotScraping) {
      const module = await import('got-scraping');
      gotScraping = module.gotScraping;
    }

    const response = await gotScraping({
      url: manganatoUrl,
      headerGeneratorOptions: { browsers:[{ name: 'chrome', minVersion: 110 }] }
    });
    
    const $ = cheerio.load(response.body);
    const chapters =[];
    
    $('.row-content-chapter li.a-h').each((i, el) => {
      const aTag = $(el).find('a.chapter-name');
      const chTitle = aTag.text().trim();
      const chLink = aTag.attr('href');
      const numMatch = chTitle.match(/Chapter\s+([\d.]+)/i);
      const num = numMatch ? numMatch[1] : '0';
      
      if (chLink) {
        chapters.push({
          ch_title: `Chapter ${num} (Manganato)`,
          chapter_number: num,
          slug: `nato_${Buffer.from(chLink).toString('base64')}`,
          time: $(el).find('.chapter-time').text().trim(),
          provider: 'Manganato'
        });
      }
    });
    
    return chapters;
  } catch (err) {
    console.error("[MANGANATO] Error fetching chapters:", err.message);
    return[];
  }
}

// 2. The Dynamic Searcher
async function searchAndGetChapters(title) {
  try {
    if (!gotScraping) { 
        const module = await import('got-scraping'); 
        gotScraping = module.gotScraping; 
    }
    
    const words = title.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().split(/\s+/);
    const query = words.slice(0, 3).join('_');
    if (!query) return[];

    let searchUrl = `https://manganato.com/search/story/${query}`;
    let res = await gotScraping({ 
        url: searchUrl, 
        headerGeneratorOptions: { browsers:[{ name: 'chrome', minVersion: 110 }] } 
    });
    
    let $ = cheerio.load(res.body);
    
    let mangaLink = null;
    if ($('.panel-story-info').length > 0) {
        mangaLink = res.url;
    } else {
        mangaLink = $('.search-story-item a.item-title').first().attr('href');
    }

    if (!mangaLink) return[];
    
    // Now it successfully calls getChapters!
    return await getChapters(mangaLink); 
    
  } catch (e) {
    console.error("[MANGANATO] Search Error:", e.message);
    return
