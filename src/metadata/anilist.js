const axios = require('axios');
const ANILIST_URL = 'https://graphql.anilist.co';

function formatMedia(m) {
  if (!m) return null;
  return {
    slug: m.id.toString(), // FIXED: Frontend requires this to be named 'slug'
    title: m.title.english || m.title.romaji || m.title.native || 'Unknown',
    image: m.coverImage?.extraLarge || '',
    type: m.countryOfOrigin === 'KR' ? 'manhwa' : m.countryOfOrigin === 'CN' ? 'manhua' : 'manga',
    status: m.status || 'UNKNOWN'
  };
}

async function getHomepage() {
  const query = `query {
    trending: Page(page: 1, perPage: 20) { media(type: MANGA, sort: TRENDING_DESC) { id title { romaji english native } coverImage { extraLarge } countryOfOrigin status } }
    popular: Page(page: 1, perPage: 20) { media(type: MANGA, sort: POPULAR_DESC) { id title { romaji english native } coverImage { extraLarge } countryOfOrigin status } }
    manhwa: Page(page: 1, perPage: 20) { media(type: MANGA, sort: TRENDING_DESC, countryOfOrigin: "KR") { id title { romaji english native } coverImage { extraLarge } countryOfOrigin status } }
  }`;
  try {
    const res = await axios.post(ANILIST_URL, { query });
    const data = res.data.data;
    return {
      trending: data.trending.media.map(formatMedia),
      popular: data.popular.media.map(formatMedia),
      latest: data.popular.media.map(formatMedia), // Fallback for old frontend maps
      new_arrivals: data.manhwa.media.map(formatMedia)
    };
  } catch (e) { return { trending:[], popular: [], latest: [], new_arrivals:[] }; }
}

async function searchManga(query, page = 1) {
  if (!query) return { list:[], total: 0, current_page: page };
  const queryStr = `query ($search: String, $page: Int) {
    Page(page: $page, perPage: 24) { pageInfo { total currentPage hasNextPage } media(search: $search, type: MANGA, sort: SEARCH_MATCH) { id title { romaji english native } coverImage { extraLarge } countryOfOrigin status } }
  }`;
  try {
    const res = await axios.post(ANILIST_URL, { query: queryStr, variables: { search: query, page: parseInt(page) } });
    const data = res.data.data.Page;
    return { list: data.media.map(formatMedia), current_page: data.pageInfo.currentPage, total: data.pageInfo.total };
  } catch (e) { return { list:[], total: 0, current_page: page }; }
}

async function getInfo(anilistId) {
  const query = `query ($id: Int) {
    Media(id: $id, type: MANGA) { id title { romaji english native } coverImage { extraLarge } bannerImage description(asHtml: false) status countryOfOrigin startDate { year } genres tags { name rank } staff { edges { role node { name { full } } } } }
  }`;
  try {
    const res = await axios.post(ANILIST_URL, { query, variables: { id: parseInt(anilistId) } });
    const m = res.data.data.Media;
    let authorName = 'Unknown';
    if (m.staff && m.staff.edges) {
        const authorEdge = m.staff.edges.find(e => e.role.toLowerCase().includes('story') || e.role.toLowerCase().includes('art'));
        if (authorEdge) authorName = authorEdge.node.name.full;
    }
    let cleanDesc = m.description ? m.description.replace(/<[^>]*>?/gm, '') : '';
    return {
      slug: m.id.toString(), page: m.title.english || m.title.romaji || 'Unknown', alt_titles:[m.title.english, m.title.romaji, m.title.native].filter(Boolean),
      poster: m.coverImage?.extraLarge || '', banner: m.bannerImage || '', description: cleanDesc, status: m.status || 'UNKNOWN',
      type: m.countryOfOrigin === 'KR' ? 'manhwa' : m.countryOfOrigin === 'CN' ? 'manhua' : 'manga', authors: authorName, year: m.startDate?.year?.toString() || '',
      genres: m.genres ||[], themes: m.tags?.filter(t => t.rank >= 50).map(t => t.name) ||[], ch_list:[], total_chapters: 0
    };
  } catch (e) { return { error: e.message }; }
}

// FIXED: Added Advanced Browse functionality
async function browse(page = 1, filters = {}) {
  const queryStr = `query ($page: Int, $sort: [MediaSort], $country: String, $status: MediaStatus) {
    Page(page: $page, perPage: 24) { pageInfo { total currentPage } media(type: MANGA, sort: $sort, countryOfOrigin: $country, status: $status) { id title { romaji english native } coverImage { extraLarge } countryOfOrigin status } }
  }`;
  try {
    let sort = ['POPULAR_DESC'];
    if (filters.sort === 'latest') sort = ['UPDATED_AT_DESC'];
    else if (filters.sort === 'new') sort = ['START_DATE_DESC'];
    else if (filters.sort === 'az') sort = ['TITLE_ENGLISH'];

    let country = undefined;
    if (filters.type === 'manhwa') country = 'KR';
    else if (filters.type === 'manhua') country = 'CN';
    else if (filters.type === 'manga') country = 'JP';

    let status = undefined;
    if (filters.status && filters.status.toLowerCase() !== 'all') {
      const s = filters.status.toUpperCase();
      if (['FINISHED', 'RELEASING', 'HIATUS', 'CANCELLED'].includes(s)) status = s;
    }

    const res = await axios.post(ANILIST_URL, { query: queryStr, variables: { page: parseInt(page), sort, country, status } });
    const data = res.data.data.Page;
    return { list: data.media.map(formatMedia), current_page: data.pageInfo.currentPage, total: data.pageInfo.total, total_pages: Math.ceil(data.pageInfo.total / 24) };
  } catch (e) { return { list:[], total: 0 }; }
}

async function categoryFetch(page, sortStr, country) {
  return await browse(page, { sort: sortStr, type: country });
}

module.exports = { getHomepage, searchManga, getInfo, browse, categoryFetch };
