const express = require('express');
const cors = require('cors');
const anilist = require('./src/metadata/anilist'); 
// Note: We will add the chapter providers in the next phase!

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => res.json({ status: 'ok', message: 'ManhwaHub V2 Core Running' }));

// ==========================================
// METADATA ROUTES (Powered by AniList)
// ==========================================
app.get('/api/home', async (req, res) => res.json(await anilist.getHomepage()));

app.get('/api/search/:query', async (req, res) => {
  res.json(await anilist.searchManga(req.params.query, req.query.page || 1));
});
app.get('/api/search', async (req, res) => {
  const q = req.query.q || req.query.query || '';
  res.json(await anilist.searchManga(q, req.query.page || 1));
});

app.get('/api/info/:id', async (req, res) => res.json(await anilist.getInfo(req.params.id)));

// ==========================================
// TEMPORARY PLACEHOLDERS FOR PHASE 2
// ==========================================
// We will build the Multi-Provider Chapter Fetcher next!
app.get('/api/chapters/:id', async (req, res) => {
  res.json({ ch_list:[], total_chapters: 0, message: "Multi-Provider architecture coming in Phase 2!" });
});

app.get('/api/chapter/:slug', async (req, res) => {
  res.json({ chapters:[], error: "Image fetcher coming in Phase 2!" });
});

// ==========================================
// IMAGE PROXY (Crucial for bypassing Cloudflare later)
// ==========================================
app.get('/api/proxy/image', async (req, res) => {
  const imageUrl = req.query.url;
  if (!imageUrl) return res.status(400).send('No image URL provided');

  try {
    const axios = require('axios');
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://manganato.com/' 
      }
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
