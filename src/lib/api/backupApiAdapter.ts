/**
 * Compatibility adapter for beat-anime-api-backup.onrender.com.
 *
 * The rest of the codebase was built for the Tatakai/hianime-shaped API
 * (`/api/v2/hianime/*`, `/api/v2/anime/*`). The backup API exposes a
 * completely different route surface (`/api/`, `/api/search`, `/api/info`,
 * `/api/episode`, `/api/stream`, ...). Rather than rewrite every consumer,
 * this adapter intercepts fetches that target the backup host on legacy
 * paths, rewrites them to the backup's routes, and reshapes the JSON into
 * the shape the app expects.
 *
 * Unknown legacy paths degrade gracefully to safe empty structures so the
 * UI keeps rendering instead of throwing.
 */

export const BACKUP_API_HOST = "beat-anime-api-backup.onrender.com";
export const BACKUP_API_KEY = "beatanime_X7QvK8mP2Lr9NwT5YcA";

function isBackupHost(host: string): boolean {
  return host.toLowerCase() === BACKUP_API_HOST;
}

function parseLegacyPath(pathname: string): { kind: string; rest: string } | null {
  // Match: /api/v2/{hianime|anime|manga}/<rest>
  const m = pathname.match(/^\/api\/v2\/(hianime|anime|manga)\/(.*)$/i);
  if (!m) return null;
  return { kind: m[1].toLowerCase(), rest: m[2] };
}

function safeString(v: any): string {
  return v == null ? "" : String(v);
}

function toInt(v: any, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function mapAnimeCard(item: any) {
  return {
    id: safeString(item?.anime_id || item?.id),
    name: safeString(item?.title || item?.name),
    jname: safeString(item?.title || item?.name),
    poster: safeString(item?.poster || item?.image),
    type: safeString(item?.type || "TV"),
    duration: safeString(item?.duration || item?.run_time || ""),
    rating: safeString(item?.rating || ""),
    episodes: { sub: toInt(item?.episode || item?.episodes || 0), dub: 0 },
  };
}

function emptyHome() {
  return {
    genres: [],
    latestEpisodeAnimes: [],
    spotlightAnimes: [],
    top10Animes: { today: [], week: [], month: [] },
    topAiringAnimes: [],
    topUpcomingAnimes: [],
    trendingAnimes: [],
    mostPopularAnimes: [],
    mostFavoriteAnimes: [],
    latestCompletedAnimes: [],
  };
}

function shapeHome(payload: any) {
  const results = payload?.data?.results || payload?.results || {};
  const fresh = Array.isArray(results.fresh_drops) ? results.fresh_drops : [];
  const movies = Array.isArray(results.latest_animeMovies) ? results.latest_animeMovies : [];
  const watchedFilms = Array.isArray(results.mostWatched_Films) ? results.mostWatched_Films : [];
  const watchedSeries = Array.isArray(results.mostWatched_Series) ? results.mostWatched_Series : [];
  const onAir = Array.isArray(results.on_air_series) ? results.on_air_series : [];

  const home = emptyHome();
  home.latestEpisodeAnimes = fresh.map(mapAnimeCard);
  home.topAiringAnimes = onAir.map(mapAnimeCard);
  home.topUpcomingAnimes = movies.map(mapAnimeCard);
  home.mostPopularAnimes = watchedSeries.map(mapAnimeCard);
  home.mostFavoriteAnimes = watchedFilms.map(mapAnimeCard);
  home.latestCompletedAnimes = watchedSeries.map(mapAnimeCard);
  home.trendingAnimes = fresh.slice(0, 10).map((it: any, i: number) => ({
    id: safeString(it?.anime_id),
    name: safeString(it?.title),
    poster: safeString(it?.poster),
    rank: i + 1,
  }));
  const spotlightPool = onAir.length ? onAir : fresh;
  home.spotlightAnimes = spotlightPool.slice(0, 8).map((it: any, i: number) => ({
    id: safeString(it?.anime_id),
    name: safeString(it?.title),
    jname: safeString(it?.title),
    poster: safeString(it?.poster),
    banner: safeString(it?.poster),
    description: "",
    rank: i + 1,
    otherInfo: [safeString(it?.season || ""), safeString(it?.episode || "")].filter(Boolean),
    episodes: { sub: toInt(it?.episode || 0), dub: 0 },
  }));
  const topTen = watchedSeries.slice(0, 10).map((it: any, i: number) => ({
    id: safeString(it?.anime_id),
    name: safeString(it?.title),
    poster: safeString(it?.poster),
    rank: i + 1,
    episodes: { sub: toInt(it?.episode || 0), dub: 0 },
  }));
  home.top10Animes = { today: topTen, week: topTen, month: topTen };
  return home;
}

function shapeSearch(payload: any, query: string) {
  const results = payload?.results || {};
  const rows = Array.isArray(results.results) ? results.results : [];
  return {
    animes: rows.map(mapAnimeCard),
    mostPopularAnimes: [],
    currentPage: toInt(results.currentPage, 1),
    totalPages: toInt(results.totalPages, 1),
    hasNextPage: toInt(results.currentPage, 1) < toInt(results.totalPages, 1),
    searchQuery: query,
  };
}

function shapeInfo(payload: any, id: string) {
  const d = payload?.data || payload?.results || {};
  const totalEpisodes = toInt(d.episodes, 0);
  return {
    info: {
      id: safeString(d.anime_id || id),
      name: safeString(d.title),
      poster: safeString(d.poster),
      description: safeString(d.overview),
      stats: {
        rating: safeString(d.rating),
        quality: safeString(d.quality),
        episodes: { sub: totalEpisodes, dub: 0 },
        type: safeString(d.type || "TV"),
        duration: safeString(d.runningTime || d.run_time || ""),
      },
      promotionalVideos: [],
      characterVoiceActor: [],
    },
    moreInfo: {
      aired: safeString(d.year),
      genres: Array.isArray(d.genres) ? d.genres : [],
      status: "",
      studios: "",
      duration: safeString(d.runningTime || d.run_time || ""),
      malId: null,
      anilistId: null,
      language: safeString(d.language || ""),
      totalSeasons: toInt(d.seasons, 1),
    },
  };
}

function shapeEpisodes(payload: any) {
  const results = payload?.results || {};
  const list = Array.isArray(results.episodes) ? results.episodes : [];
  return {
    totalEpisodes: list.length,
    episodes: list.map((ep: any) => ({
      number: toInt(ep.episode, 0),
      title: safeString(ep.title || `Episode ${ep.episode}`),
      episodeId: safeString(ep.episode_id),
      isFiller: false,
      image: safeString(ep.image),
      season: toInt(ep.season, 1),
    })),
  };
}

function shapeStream(payload: any) {
  const rows: any[] = Array.isArray(payload?.results) ? payload.results : [];
  const sources = rows.map((r) => ({
    url: safeString(r.embed),
    isM3U8: /\.m3u8(\?|$)/i.test(safeString(r.embed)),
    isEmbed: true,
    server: safeString(r.server),
    providerName: safeString(r.server),
    providerKey: safeString(r.server).toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    quality: "auto",
    language: "sub",
    langCode: "sub",
  }));
  return {
    headers: { Referer: "", "User-Agent": "" },
    sources,
    subtitles: [],
    tracks: [],
    anilistID: null,
    malID: null,
  };
}

/**
 * If `url` targets the backup API on a legacy path, translate to the backup
 * API's real routes and return { url, transform }. Otherwise return null.
 */
export function translateBackupRequest(
  fullUrl: string
): { url: string; transform: (json: any) => any } | null {
  let parsed: URL;
  try {
    parsed = new URL(fullUrl);
  } catch {
    return null;
  }
  if (!isBackupHost(parsed.hostname)) return null;
  const legacy = parseLegacyPath(parsed.pathname);
  if (!legacy) return null;

  const { rest } = legacy;
  const qs = parsed.searchParams;
  const B = `${parsed.protocol}//${parsed.hostname}`;

  // --- home ---
  if (rest === "home" || rest === "") {
    return {
      url: `${B}/api`,
      transform: (json) => shapeHome(json),
    };
  }

  // --- search ---
  if (rest.startsWith("search")) {
    const q = qs.get("q") || qs.get("query") || qs.get("keyword") || "";
    const page = qs.get("page") || "1";
    return {
      url: `${B}/api/search?s=${encodeURIComponent(q)}&page=${encodeURIComponent(page)}`,
      transform: (json) => shapeSearch(json, q),
    };
  }

  // --- suggestion / auto-complete -> reuse search ---
  if (rest.startsWith("suggestion") || rest.startsWith("suggest")) {
    const q = qs.get("q") || qs.get("keyword") || "";
    return {
      url: `${B}/api/search?s=${encodeURIComponent(q)}&page=1`,
      transform: (json) => ({ suggestions: shapeSearch(json, q).animes }),
    };
  }

  // --- anime/<id>/episodes ---
  const epsMatch = rest.match(/^anime\/([^\/]+)\/episodes\/?$/i);
  if (epsMatch) {
    const id = decodeURIComponent(epsMatch[1]);
    return {
      url: `${B}/api/episode?id=${encodeURIComponent(id)}&season=1`,
      transform: (json) => shapeEpisodes(json),
    };
  }

  // --- anime/<id>/next-episode-schedule ---
  if (/^anime\/[^\/]+\/next-episode-schedule\/?$/i.test(rest)) {
    return {
      url: `${B}/api`,
      transform: () => ({}),
    };
  }

  // --- anime/<id> (info) ---
  const infoMatch = rest.match(/^anime\/([^\/]+)\/?$/i);
  if (infoMatch) {
    const id = decodeURIComponent(infoMatch[1]);
    return {
      url: `${B}/api/info?id=${encodeURIComponent(id)}`,
      transform: (json) => shapeInfo(json, id),
    };
  }

  // --- episode/servers ---
  if (rest.startsWith("episode/servers") || rest.startsWith("servers")) {
    const epId = qs.get("animeEpisodeId") || qs.get("id") || "";
    return {
      url: `${B}/api`,
      transform: () => ({
        episodeId: epId,
        episodeNo: 0,
        sub: [{ serverId: 1, serverName: "backup" }],
        dub: [],
        raw: [],
      }),
    };
  }

  // --- episode/sources ---
  if (rest.startsWith("episode/sources") || rest === "stream") {
    const epId = qs.get("animeEpisodeId") || qs.get("id") || "";
    // epId is expected to look like `anime-slug-1x3` or `anime-slug?ep=123`.
    // Try to parse `<slug>-<season>x<episode>` first (backup API's own scheme).
    let slug = epId;
    let season = 1;
    let episode = 1;
    const sxE = epId.match(/^(.*)-(\d+)x(\d+)$/);
    if (sxE) {
      slug = sxE[1];
      season = toInt(sxE[2], 1);
      episode = toInt(sxE[3], 1);
    } else {
      const [rawSlug, query] = epId.split("?");
      slug = rawSlug;
      const inner = new URLSearchParams(query || "");
      episode = toInt(inner.get("ep") || "1", 1);
    }
    return {
      url: `${B}/api/stream?id=${encodeURIComponent(slug)}&season=${season}&ep=${episode}`,
      transform: (json) => shapeStream(json),
    };
  }

  // Manga endpoints — backup API has none. Return empty shape.
  if (parseLegacyPath(parsed.pathname)?.kind === "manga") {
    return {
      url: `${B}/api`,
      transform: () => ({ mangaList: [], results: [], data: [], totalPages: 0, currentPage: 1 }),
    };
  }

  // Fallback: return the API root and hand back an empty envelope.
  return {
    url: `${B}/api`,
    transform: () => ({}),
  };
}
