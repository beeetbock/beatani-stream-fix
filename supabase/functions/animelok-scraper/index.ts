// Animelok scraper edge function
// Scrapes animelok.xyz SSR HTML to provide:
//   GET ?path=home               -> { trending: [...], spotlight: [...], banner: {...} }
//   GET ?path=search&q=naruto    -> { results: [...] }
//   GET ?path=anime&slug=foo     -> { info, episodes? }
//
// Returns shapes loosely compatible with the BeatAPI HiAnime types so the
// frontend can use this as a primary info source with HiAnime fallback.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const ORIGIN = "https://animelok.xyz";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "user-agent": UA,
      accept: "text/html,application/xhtml+xml",
      "accept-language": "en-US,en;q=0.9",
    },
  });
  if (!res.ok) throw new Error(`upstream ${res.status} for ${url}`);
  return await res.text();
}

function rscChunks(html: string): string {
  const re = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g;
  let m: RegExpExecArray | null;
  let joined = "";
  while ((m = re.exec(html))) {
    try {
      joined += JSON.parse('"' + m[1] + '"');
    } catch {
      // best-effort decode
      joined += m[1];
    }
  }
  return joined;
}

// Extract balanced JSON array starting at index `i` in s (s[i] must be '[')
function readArray(s: string, i: number): string | null {
  if (s[i] !== "[") return null;
  let depth = 0,
    inStr = false,
    esc = false;
  for (let j = i; j < s.length; j++) {
    const ch = s[j];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
    } else {
      if (ch === '"') inStr = true;
      else if (ch === "[") depth++;
      else if (ch === "]") {
        depth--;
        if (depth === 0) return s.substring(i, j + 1);
      }
    }
  }
  return null;
}

interface AlokAnime {
  id: number;
  slug: string;
  title: string;
  coverImage?: {
    color?: string;
    large?: string;
    medium?: string;
    extraLarge?: string;
    hianime?: string;
  };
  totalEpisodes?: number;
  languageEpisodes?: Record<string, number>;
}

function findAllAnimeArrays(joined: string): AlokAnime[][] {
  // Find every "data":[{"id":...] block, parse it
  const out: AlokAnime[][] = [];
  const marker = '"data":[';
  let i = 0;
  while (true) {
    const idx = joined.indexOf(marker, i);
    if (idx < 0) break;
    const arrStart = idx + marker.length - 1; // position of '['
    const raw = readArray(joined, arrStart);
    i = arrStart + 1;
    if (!raw) continue;
    try {
      const arr = JSON.parse(raw);
      if (
        Array.isArray(arr) &&
        arr.length &&
        typeof arr[0] === "object" &&
        arr[0] &&
        "id" in arr[0] &&
        "slug" in arr[0] &&
        "title" in arr[0]
      ) {
        out.push(arr as AlokAnime[]);
      }
    } catch {
      /* ignore */
    }
  }
  return out;
}

function toHomeCard(a: AlokAnime) {
  const poster =
    a.coverImage?.extraLarge ||
    a.coverImage?.large ||
    a.coverImage?.medium ||
    a.coverImage?.hianime ||
    "";
  const langs = a.languageEpisodes || {};
  const sub = langs["JAPANESE"] || a.totalEpisodes || 0;
  const dub =
    langs["ENGLISH"] ||
    langs["HINDI"] ||
    langs["TAMIL"] ||
    langs["TELUGU"] ||
    0;
  return {
    id: a.slug.replace(/-(\d+)$/, ""), // strip trailing id; HiAnime uses base slug
    alokId: a.id,
    alokSlug: a.slug,
    name: a.title,
    poster,
    color: a.coverImage?.color,
    languageEpisodes: langs,
    episodes: { sub, dub },
    totalEpisodes: a.totalEpisodes ?? sub,
  };
}

async function scrapeHome() {
  const html = await fetchHtml(`${ORIGIN}/home`);
  const joined = rscChunks(html);
  const arrays = findAllAnimeArrays(joined);
  // The largest array is typically Trending (10). If the page exposes more
  // sections we use their relative order: trending, latest, popular, etc.
  const sorted = arrays.slice().sort((a, b) => b.length - a.length);
  const trending = (sorted[0] || []).map(toHomeCard);

  // Hero banners pulled from <link rel="preload" as="image">
  const bannerRe =
    /<link[^>]+rel="preload"[^>]+as="image"[^>]+href="\/_next\/image\?url=([^"]+anime-banners[^"]+)"/g;
  const banners: Array<{ banner: string; logo?: string; slug?: string }> = [];
  let bm: RegExpExecArray | null;
  while ((bm = bannerRe.exec(html))) {
    try {
      const decoded = decodeURIComponent(bm[1].split("&")[0]);
      const slugMatch = decoded.match(/anime-banners\/([a-z0-9-]+)\.webp/);
      banners.push({
        banner: decoded,
        slug: slugMatch?.[1],
      });
    } catch {
      /* ignore */
    }
  }

  // Match logos by slug
  const logoRe = /https?:\/\/anime-lok-assets\.pages\.dev\/anime-logo\/([a-z0-9-]+)\.webp/g;
  const logos: Record<string, string> = {};
  let lm: RegExpExecArray | null;
  while ((lm = logoRe.exec(html))) {
    logos[lm[1]] = lm[0];
  }
  for (const b of banners) {
    if (b.slug && logos[b.slug]) b.logo = logos[b.slug];
  }

  return {
    source: "animelok",
    banners,
    trending,
    sections: sorted.map((a) => a.map(toHomeCard)),
  };
}

async function scrapeSearch(q: string) {
  const html = await fetchHtml(
    `${ORIGIN}/search?keyword=${encodeURIComponent(q)}`,
  );
  const joined = rscChunks(html);
  // Extract slug+title+id triples (single regex pass; preserves order/dedup)
  const re =
    /"id":(\d+),"slug":"([^"]+)","title":"((?:[^"\\]|\\.)+)","coverImage":\{([^}]+)\}/g;
  const seen = new Set<string>();
  const results: any[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(joined))) {
    const slug = m[2];
    if (seen.has(slug)) continue;
    seen.add(slug);
    const cov = m[4];
    const pick = (k: string) => {
      const mm = new RegExp(`"${k}":"([^"]+)"`).exec(cov);
      return mm?.[1];
    };
    const poster =
      pick("extraLarge") || pick("large") || pick("medium") || pick("hianime") || "";
    results.push({
      id: slug.replace(/-(\d+)$/, ""),
      alokId: Number(m[1]),
      alokSlug: slug,
      name: JSON.parse('"' + m[3] + '"'),
      poster,
    });
  }
  return { source: "animelok", query: q, results };
}

async function scrapeAnime(slug: string) {
  // Animelok anime pages live at /anime/<base-slug-without-id>
  const baseSlug = slug.replace(/-(\d+)$/, "");
  const html = await fetchHtml(`${ORIGIN}/anime/${baseSlug}`);
  const joined = rscChunks(html);

  const desc = /"description":"((?:[^"\\]|\\.){20,3000})"/.exec(joined);
  const banner = /https?:\/\/anime-lok-assets\.pages\.dev\/anime-banners\/[a-z0-9-]+\.webp/.exec(html);
  const logo = /https?:\/\/anime-lok-assets\.pages\.dev\/anime-logo\/[a-z0-9-]+\.webp/.exec(html);

  // Languages with episode counts often appear inline as buttons
  const langs: Record<string, number> = {};
  const langRe =
    /(HINDI|ENGLISH|JAPANESE|TAMIL|TELUGU|MALAYALAM|KANNADA|BENGALI)[^0-9]{0,40}(\d{1,4})/g;
  let lm: RegExpExecArray | null;
  while ((lm = langRe.exec(joined))) {
    const k = lm[1];
    const v = Number(lm[2]);
    if (!langs[k] || v > langs[k]) langs[k] = v;
  }

  return {
    source: "animelok",
    slug: baseSlug,
    info: {
      name: /"title":"([^"]+)"/.exec(joined)?.[1],
      description: desc ? JSON.parse('"' + desc[1] + '"') : undefined,
      banner: banner?.[0],
      logo: logo?.[0],
      languageEpisodes: langs,
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const path = (url.searchParams.get("path") || "home").toLowerCase();
    let body: unknown;
    if (path === "home") body = await scrapeHome();
    else if (path === "search") {
      const q = url.searchParams.get("q") || "";
      if (!q) {
        return new Response(JSON.stringify({ error: "q required" }), {
          status: 400,
          headers: { ...corsHeaders, "content-type": "application/json" },
        });
      }
      body = await scrapeSearch(q);
    } else if (path === "anime") {
      const slug = url.searchParams.get("slug") || "";
      if (!slug) {
        return new Response(JSON.stringify({ error: "slug required" }), {
          status: 400,
          headers: { ...corsHeaders, "content-type": "application/json" },
        });
      }
      body = await scrapeAnime(slug);
    } else {
      return new Response(JSON.stringify({ error: "unknown path" }), {
        status: 400,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify(body), {
      headers: {
        ...corsHeaders,
        "content-type": "application/json",
        "cache-control": "public, max-age=300, s-maxage=300",
      },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: String((e as Error)?.message || e) }),
      {
        status: 502,
        headers: { ...corsHeaders, "content-type": "application/json" },
      },
    );
  }
});