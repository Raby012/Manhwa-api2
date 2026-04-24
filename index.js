const express = require('express');
const cors = require('cors');
const axios = require('axios');
const redis = require('redis');
const { MongoClient } = require('mongodb');

// Note: "anilist" here now uses the mangadex_meta file we just created
const anilist = require('./src/metadata/anilist'); 
const mangadex = require('./src/providers/mangadex');
const manganato = require('./src/providers/manganato');
const comick = require('./src/providers/comick');
const reader = require('./src/core/reader');

const app = express();
app.use(cors());
app.use(express.json());

// ==========================================
// REDIS CLOUD CONNECTION
// ==========================================
let redisClient = null;
(async () => {
  if (process.env.REDIS_URL) {
    try {
      redisClient = redis.createClient({ url: process.env.REDIS_URL });
      redisClient.on('error', (err) => console.log('Redis Client Error:', err.message));
      await redisClient.connect();
      console.log('✅ Connected to Redis Cloud Successfully!');
    } catch(e) { console.error("Redis Failed:", e.message) }
  } else {
    console.log('⚠️ No REDIS_URL found in Environment Variables.');
  }
})();

async function checkCache(req, res, next) {
  if (!redisClient) return next();
  try {
    const cachedData = await redisClient.get(req.originalUrl);
    if (cachedData) return res.json(JSON.parse(cachedData));
    next();
  } catch (err) { next(); }
}

async function saveToCache(key, data, exp = 600) {
  if (redisClient) await redisClient.setEx(key, exp, JSON.stringify(data));
}

// ==========================================
// MONGODB CONNECTION & USER ROUTES
// ==========================================
let db = null;
(async () => {
  if (process.env.MONGO_URI) {
    try {
      const mongoClient = new MongoClient(process.env.MONGO_URI);
      await mongoClient.connect();
      db = mongoClient.db('manhwahub'); 
      console.log('✅ MongoDB Database Connected Successfully!');
    } catch(e) { console.error("❌ MongoDB Failed:", e.message) }
  } else {
      console.log('⚠️ No MONGO_URI found in Environment Variables.');
  }
})();

// Route to Save Reading History
app.post('/api/user/history', async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not connected" });
  
  const { userId, mangaId, title, cover, chapterId, chapterNumber } = req.body;
  if (!userId || !mangaId) return res.status(400).json({ error: "Missing data" });

  try {
    const historyCollection = db.collection('history');
    await historyCollection.updateOne(
      { userId, mangaId }, 
      { $set: { title, cover, chapterId, chapterNumber, updatedAt: new Date() } },
      { upsert: true }
    );
    res.json({ status: "success", message: "History saved" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Route to Get Reading History
app.get('/api/user/history/:userId', async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not connected" });
  try {
    const history = await db.collection('history')
                            .find({ userId: req.params.userId })
                            .sort({ updatedAt: -1 })
                            .toArray();
    res.json(history);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ==========================================
// METADATA ROUTES
// ==========================================
app.get('/', (req, res) => res.json({ status: 'ok', message: 'ManhwaHub V2 Core Running' }));

app.get('/api/home', checkCache, async (req, res) => { 
  const data = await anilist.getHomepage(); 
  await saveToCache(req.originalUrl, data, 300); 
  res.json(data); 
});

app.get('/api/latest/:page', checkCache, async (req, res) => { 
  const data = await anilist.categoryFetch(req.params.page, 'latest'); 
  await saveToCache(req.originalUrl, data, 600); 
  res.json(data); 
});

app.get('/api/all/:page', checkCache, async (req, res) => { 
  const data = await anilist.categoryFetch(req.params.page, 'popular'); 
  await saveToCache(req.originalUrl, data, 600); 
  res.json(data); 
});

app.get('/api/trending/:page', checkCache, async (req, res) => { 
  const data = await anilist.categoryFetch(req.params.page, 'popular'); 
  await saveToCache(req.originalUrl, data, 600); 
  res.json(data); 
});

app.get('/api/manhwa/:page', checkCache, async (req, res) => { 
  const data = await anilist.categoryFetch(req.params.page, 'popular', 'manhwa'); 
  await saveToCache(req.originalUrl, data, 600); 
  res.json(data); 
});

app.get('/api/manhua/:page', checkCache, async (req, res) => { 
  const data = await anilist.categoryFetch(req.params.page, 'popular', 'manhua'); 
  await saveToCache(req.originalUrl, data, 600); 
  res.json(data); 
});

app.get('/api/manga/:page', checkCache, async (req, res) => { 
  const data = await anilist.categoryFetch(req.params.page, 'popular', 'manga'); 
  await saveToCache(req.originalUrl, data, 600); 
  res.json(data); 
});

app.get('/api/browse/:page', async (req, res) => { 
  const filters = { type: req.query.type || '', status: req.query.status || '', sort: req.query.sort || 'popular', genre: req.query.genre || '' }; 
  res.json(await anilist.browse(req.params.page || 1, filters)); 
});

app.get('/api/search/:query', async (req, res) => res.json(await anilist.searchManga(req.params.query, req.query.page || 1)));

app.get('/api/search', async (req, res) => res.json(await anilist.searchManga(req.query.q || req.query.query || '', req.query.page || 1)));

app.get('/api/info/:id', checkCache, async (req, res) => { 
  const data = await anilist.getInfo(req.params.id); 
  await saveToCache(req.originalUrl, data, 86400); 
  res.json(data); 
});

// ==========================================
// CHAPTER ROUTES
// ==========================================
app.get('/api/chapters/:id', checkCache, async (req, res) => {
  const mangaDexId = req.params.id; 
  
  let finalChapters = await mangadex.getChapters(mangaDexId);

  // If MangaDex deleted the chapters (like Lookism or ORV)
  if (finalChapters.length < 15) {
      console.log(`[WATERFALL] MangaDex missing chapters. Trying Manganato/ComicK...`);
      const info = await anilist.getInfo(mangaDexId); 
      const searchTitle = info.alt_en || info.page;
      
      let natoChapters = [];
      let ckChapters =[];
      
      if (searchTitle) {
          // Try both fallbacks simultaneously
          await Promise.all([
            (async () => { natoChapters = await manganato.searchAndGetChapters(searchTitle); })(),
            (async () => { ckChapters = await comick.searchAndGetChapters(searchTitle); })()
          ]);
      }

      // Pick the best fallback
      if (natoChapters.length > finalChapters.length) finalChapters = natoChapters;
      if (ckChapters.length > finalChapters.length) finalChapters = ckChapters;
  }

  finalChapters.sort((a, b) => parseFloat(b.chapter_number) - parseFloat(a.chapter_number));
  finalChapters.forEach((c, i) => c.chapter_index = i + 1);

  const responseData = { ch_list: finalChapters, total_chapters: finalChapters.length, source_used: finalChapters.length > 0 ? finalChapters[0].provider : 'None' };
  await saveToCache(req.originalUrl, responseData, 900); 
  res.json(responseData);
});

app.get('/api/chapter/:slug', async (req, res) => res.json(await reader.getPages(req.params.slug)));

// ==========================================
// IMAGE PROXY
// ==========================================
app.get('/api/proxy/image', async (req, res) => {
  const imageUrl = req.query.url;
  if (!imageUrl) return res.status(400).send('No image URL provided');
  try {
    const response = await axios.get(imageUrl, { 
      responseType: 'arraybuffer', 
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://manganato.com/' } 
    });
    res.setHeader('Content-Type', response.headers['content-type']);
    res.setHeader('Cache-Control', 'public, max-age=86400'); 
    res.send(response.data);
  } catch (error) { 
    res.status(500).send('Failed to load image'); 
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`ManhwaHub V2 running on port ${PORT}`));
