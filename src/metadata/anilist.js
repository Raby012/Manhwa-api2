const axios = require('axios');

const ANILIST_URL = 'https://graphql.anilist.co';

// GraphQL Queries
const homepageQuery = `
query {
  trending: Page(page: 1, perPage: 20) {
    media(type: MANGA, sort: TRENDING_DESC) { id title { romaji english native } coverImage { extraLarge } countryOfOrigin status }
  }
  popular: Page(page: 1, perPage: 20) {
    media(type: MANGA, sort: POPULAR_DESC) { id title { romaji english native } coverImage { extraLarge } countryOfOrigin status }
  }
  manhwa: Page(page: 1, perPage: 20) {
    media(type: MANGA, sort: TRENDING_DESC, countryOfOrigin: "KR") { id title { romaji english native } coverImage { extraLarge } countryOfOrigin status }
  }
}`;

const searchQuery = `
query ($search: String, $page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { total currentPage hasNextPage }
    media(search: $search, type: MANGA, sort: SEARCH_MATCH) {
      id title { romaji english native } coverImage { extraLarge } countryOfOrigin status
    }
  }
}`;

const infoQuery = `
query ($id: Int) {
  Media(id: $id, type: MANGA) {
    id
    title { romaji english native }
    coverImage { extraLarge }
    bannerImage
    description(asHtml: false)
    status
    countryOfOrigin
    startDate { year }
    genres
    tags { name rank }
    staff { edges { role node { name { full } } } }
  }
}`;

// Formatter to standardize data for your frontend
function formatMedia(m) {
  if (!m) return null;
  return {
    id: m.id.toString(), // The Ultimate Unified ID
    title: m.title.english || m.title.romaji || m.title.native || 'Unknown',
    alt_titles: [m.title.romaji, m.title.native].filter(Boolean),
    image: m.coverImage?.extraLarge || '',
    type: m.countryOfOrigin === 'KR' ? 'manhwa' : m.countryOfOrigin === 'CN' ? 'manhua' : 'manga',
    status: m.status || 'UNKNOWN'
  };
}

// 1. Fetch Homepage
async function getHomepage() {
  try {
    const response = await axios.post(ANILIST_URL, { query: homepageQuery });
    const data = response.data.data;
    return {
      trending: data.trending.media.map(formatMedia),
      popular: data.popular.media.map(formatMedia),
      new_arrivals: data.manhwa.media.map(formatMedia) // Repurposing manhwa for the 'new' section on frontend
    };
  } catch (error) {
    console.error("AniList Homepage Error:", error.message);
    return { trending: [], popular: [], new_arrivals:[] };
  }
}

// 2. Fetch Search Results
async function searchManga(query, page = 1) {
  if (!query) return { list:[], total: 0, current_page: page };
  try {
    const response = await axios.post(ANILIST_URL, {
      query: searchQuery,
      variables: { search: query, page: parseInt(page), perPage: 24 }
    });
    const data = response.data.data.Page;
    return {
      list: data.media.map(formatMedia),
      current_page: data.pageInfo.currentPage,
      has_next: data.pageInfo.hasNextPage,
      total: data.pageInfo.total
    };
  } catch (error) {
    console.error("AniList Search Error:", error.message);
    return { list:[], total: 0, current_page: page };
  }
}

// 3. Fetch Full Manga Details
async function getInfo(anilistId) {
  try {
    const response = await axios.post(ANILIST_URL, {
      query: infoQuery,
      variables: { id: parseInt(anilistId) }
    });
    const m = response.data.data.Media;
    
    // Find author from staff array
    let authorName = 'Unknown';
    if (m.staff && m.staff.edges) {
        const authorEdge = m.staff.edges.find(e => e.role.toLowerCase().includes('story') || e.role.toLowerCase().includes('art'));
        if (authorEdge) authorName = authorEdge.node.name.full;
    }

    // Clean up HTML tags that AniList sometimes leaves in descriptions
    let cleanDesc = m.description || '';
    cleanDesc = cleanDesc.replace(/<[^>]*>?/gm, '');

    return {
      slug: m.id.toString(), // The frontend expects "slug", we give it the Anilist ID
      page: m.title.english || m.title.romaji || 'Unknown',
      alt_titles:[m.title.english, m.title.romaji, m.title.native].filter(Boolean),
      poster: m.coverImage?.extraLarge || '',
      banner: m.bannerImage || '',
      description: cleanDesc,
      status: m.status || 'UNKNOWN',
      type: m.countryOfOrigin === 'KR' ? 'manhwa' : m.countryOfOrigin === 'CN' ? 'manhua' : 'manga',
      authors: authorName,
      year: m.startDate?.year?.toString() || '',
      genres: m.genres ||[],
      themes: m.tags?.filter(t => t.rank >= 50).map(t => t.name) || [],
      ch_list:[], // We will fill this in Phase 2 with our Providers!
      total_chapters: 0
    };
  } catch (error) {
    console.error("AniList Info Error:", error.message);
    return { error: error.message };
  }
}

module.exports = { getHomepage, searchManga, getInfo };
