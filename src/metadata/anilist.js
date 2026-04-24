const axios = require('axios');
const BASE = 'https://api.mangadex.org';
const headers = { 'Accept': 'application/json', 'User-Agent': 'ManhwaHub-V3-Render' };

function buildManga(m) {
  const cover = m.relationships.find(r => r.type === 'cover_art');
  const author = m.relationships.find(r => r.type === 'author');
  const fileName = cover?.attributes?.fileName || '';
  const lang = m.attributes.originalLanguage;
  
  const titleObj = m.attributes.title || {};
  const altTitles = m.attributes.altTitles ||[];
  let enAltTitle = null;
  for (let alt of altTitles) {
      if (alt.en) { enAltTitle = alt.en; break; }
  }
  const title = enAltTitle || titleObj.en || Object.values(titleObj)[0] || 'Unknown';
  
  return {
    slug: m.id, // MangaDex ID
    title,
    image: fileName ? `https://uploads.mangadex.org/covers/${m.id}/${fileName}.256.jpg` : '',
    type: lang === 'ko' ? 'manhwa' : (lang === 'zh' || lang === 'zh-hk') ? 'manhua' : 'manga',
    status: m.attributes.status || 'UNKNOWN'
  };
}

async function fetchManga(page, order = { updatedAt: 'desc' }, extraParams = {}) {
  const limit = 30;
  const offset = (parseInt(page) - 1) * limit;
  try {
    const res = await axios.get(`${BASE}/manga`, {
      headers,
      params: {
        limit, offset,
        originalLanguage:['ko', 'ja', 'zh', 'zh-hk'],
        order,
        includes:['cover_art', 'author'],
        availableTranslatedLanguage: ['en'],
        contentRating: ['safe', 'suggestive'],
        ...extraParams,
      }
    });
    return {
      list: res.data.data.map(buildManga),
      current_page: parseInt(page),
      total: res.data.total,
      total_pages: Math.ceil(res.data.total / limit),
    };
  } catch (e) {
    console.error("MangaDex Fetch Error:", e.message);
    return { list:[], total: 0, current_page: page };
  }
}

async function getHomepage() {
  try {
    const [t, p, n] = await Promise.all([
      fetchManga(1, { followedCount: 'desc' }, { createdAtSince: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('.')[0] }), // Trending (Popular this month)
      fetchManga(1, { followedCount: 'desc' }), // Popular
      fetchManga(1, { createdAt: 'desc' }, { originalLanguage: ['ko'] }) // New Manhwa
    ]);
    return { trending: t.list, popular: p.list, latest: p.list, new_arrivals: n.list };
  } catch (e) { return { trending:[], popular: [], latest: [], new_arrivals:[] }; }
}

async function categoryFetch(page, sortStr, country) {
  let order = { followedCount: 'desc' };
  if (sortStr === 'latest') order = { updatedAt: 'desc' };
  
  let extraParams = {};
  if (country === 'manhwa') extraParams.originalLanguage = ['ko'];
  if (country === 'manhua') extraParams.originalLanguage =['zh', 'zh-hk'];
  if (country === 'manga') extraParams.originalLanguage =['ja'];

  return await fetchManga(page, order, extraParams);
}

async function searchManga(query, page = 1) {
  if (!query) return { list:[], total: 0, current_page: page };
  const limit = 24; const offset = (parseInt(page) - 1) * limit;
  try {
    const res = await axios.get(`${BASE}/manga`, {
      headers,
      params: { title: query, limit, offset, includes:['cover_art', 'author'], availableTranslatedLanguage: ['en'], order: { relevance: 'desc' } }
    });
    return { list: res.data.data.map(buildManga), total: res.data.total, current_page: parseInt(page) };
  } catch (e) { return { list:[], total: 0, current_page: page }; }
}

async function browse(page = 1, filters = {}) {
  const limit = 24; const offset = (parseInt(page) - 1) * limit;
  const params = { limit, offset, includes: ['cover_art', 'author'], availableTranslatedLanguage: ['en'] };
  
  if (filters.type === 'manhwa') params.originalLanguage = ['ko'];
  else if (filters.type === 'manhua') params.originalLanguage =['zh', 'zh-hk'];
  else if (filters.type === 'manga') params.originalLanguage =['ja'];
  else params.originalLanguage = ['ko', 'ja', 'zh', 'zh-hk'];
  
  if (filters.status && filters.status !== 'All') params['status[]'] = filters.status.toLowerCase();
  
  const orderMap = { popular: { followedCount: 'desc' }, latest: { updatedAt: 'desc' }, new: { createdAt: 'desc' } };
  params.order = orderMap[filters.sort || 'popular'];

  try {
    const res = await axios.get(`${BASE}/manga`, { headers, params });
    return { list: res.data.data.map(buildManga), total: res.data.total, current_page: parseInt(page), total_pages: Math.ceil(res.data.total / limit) };
  } catch (e) { return { list:[], total: 0 }; }
}

async function getInfo(id) {
  try {
    const res = await axios.get(`${BASE}/manga/${id}`, { headers, params: { includes: ['cover_art', 'author', 'artist'] } });
    const m = res.data.data;
    const cover = m.relationships.find(r => r.type === 'cover_art');
    const author = m.relationships.find(r => r.type === 'author');
    const fileName = cover?.attributes?.fileName || '';
    
    const titleObj = m.attributes.title || {};
    const altTitles = m.attributes.altTitles ||[];
    let enAltTitle = '';
    for (let alt of altTitles) { if (alt.en) { enAltTitle = alt.en; break; } }
    const title = enAltTitle || titleObj.en || Object.values(titleObj)[0] || 'Unknown';

    return {
      slug: m.id, page: title, alt_en: enAltTitle,
      poster: fileName ? `https://uploads.mangadex.org/covers/${id}/${fileName}.512.jpg` : '',
      description: m.attributes.description?.en || '', status: m.attributes.status || 'UNKNOWN',
      type: m.attributes.originalLanguage === 'ko' ? 'manhwa' : 'manga',
      authors: author?.attributes?.name || 'Unknown', year: m.attributes.year || '',
      genres: (m.attributes.tags ||[]).filter(t => t.attributes.group === 'genre').map(t => t.attributes.name.en || ''),
      ch_list:[], total_chapters: 0
    };
  } catch (e) { return { error: e.message }; }
}

module.exports = { getHomepage, searchManga, getInfo, browse, categoryFetch };
