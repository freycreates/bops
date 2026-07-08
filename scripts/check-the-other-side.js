const fs = require("node:fs/promises");
const path = require("node:path");

const SOURCE_URL = "https://the-other-side.nl";
const OUTPUT_PATH = path.join(process.cwd(), "data", "bops-ticket-scan.json");
const MAX_PAGES = 30;

function getAmsterdamHour() {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Amsterdam",
    hour: "2-digit",
    hour12: false,
  }).format(new Date());
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtml(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&#038;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#8211;/g, "-")
    .replace(/&#8217;/g, "'")
    .replace(/&quot;/g, "\"");
}

function extractLinks(html, baseUrl) {
  const links = new Map();
  const anchorPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = anchorPattern.exec(html))) {
    try {
      const url = new URL(match[1], baseUrl);
      if (url.hostname !== new URL(SOURCE_URL).hostname) continue;
      url.hash = "";
      links.set(url.href, stripHtml(match[2]) || url.pathname);
    } catch {
      // Ignore malformed links from the source page.
    }
  }

  return links;
}

function getBopsEventSnippets(text) {
  const normalized = decodeHtml(text).replace(/\s+/g, " ").trim();
  const snippets = [];
  const bopsPattern = /\bbops\b/gi;
  const datePattern = /\b(mon|tue|wed|thu|fri|sat|sun)\s+\d{1,2}[-/]\d{1,2}\b/gi;
  const dateMatches = [...normalized.matchAll(datePattern)].map((match) => match.index);
  let match;

  while ((match = bopsPattern.exec(normalized))) {
    const start = [...dateMatches].reverse().find((index) => index <= match.index) ?? Math.max(0, match.index - 220);
    const end = dateMatches.find((index) => index > match.index + 4) ?? Math.min(normalized.length, match.index + 700);
    snippets.push(normalized.slice(start, end).trim());
  }

  return snippets;
}

function getTicketSignal(page) {
  const snippets = getBopsEventSnippets(page.text);
  return snippets.find((snippet) => {
    const text = snippet.toLowerCase();
    return text.includes("bops") && /\btickets?\b/.test(text) && !/\bsoon\b/.test(text);
  });
}

async function fetchPage(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "BOPS ticket checker (+https://bops.ams)",
    },
  });

  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }

  const html = await response.text();
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || "";

  return {
    url,
    title: stripHtml(title),
    text: stripHtml(html),
    links: extractLinks(html, url),
  };
}

async function main() {
  if (!process.env.FORCE_RUN && getAmsterdamHour() !== "05") {
    console.log("Skipping: it is not 05:00 in Amsterdam.");
    return;
  }

  const home = await fetchPage(SOURCE_URL);
  const queue = [SOURCE_URL];
  const homeLinks = [...home.links.entries()]
    .filter(([url, label]) => /event|agenda|program|ticket|bops/i.test(`${url} ${label}`))
    .slice(0, MAX_PAGES - 1)
    .map(([url]) => url);
  queue.push(...homeLinks);

  const seen = new Set();
  const matches = [];

  for (const url of queue) {
    if (seen.has(url)) continue;
    seen.add(url);

    try {
      const page = url === SOURCE_URL ? home : await fetchPage(url);
      const ticketSignal = getTicketSignal(page);
      if (ticketSignal) {
        matches.push({
          title: page.title || "BOPS ticket signal",
          url: page.url,
          excerpt: ticketSignal.slice(0, 260),
        });
      }
    } catch (error) {
      console.warn(error.message);
    }
  }

  const result = {
    checkedAt: new Date().toISOString(),
    source: SOURCE_URL,
    matches,
  };

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`Found ${matches.length} BOPS ticket/event match(es).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
