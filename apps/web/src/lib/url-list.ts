// Parse a pasted list of pages to scan: full URLs or paths, one per line (commas work too).
// Only pages on the site's own domain (with or without www) are accepted.

export const MAX_LISTED_URLS = 200;

export interface UrlList {
  urls: string[];
  /** Lines that couldn't be used, with the reason. */
  rejected: { line: string; reason: string }[];
}

export function parseUrlList(text: string, domain: string): UrlList {
  const base = domain.replace(/^www\./, "");
  const urls: string[] = [];
  const rejected: UrlList["rejected"] = [];

  for (const line of text.split(/[\n,]/).map((l) => l.trim()).filter(Boolean)) {
    let url: URL;
    try {
      url = line.startsWith("/") ? new URL(line, `https://${domain}`) : new URL(/^https?:\/\//i.test(line) ? line : `https://${line}`);
    } catch {
      rejected.push({ line, reason: "not a URL or path" });
      continue;
    }
    const host = url.hostname.toLowerCase();
    if (host !== base && host !== `www.${base}`) {
      rejected.push({ line, reason: `not on ${domain}` });
      continue;
    }
    // One host for the whole scan: the site's, as entered.
    url.protocol = "https:";
    url.hostname = domain;
    url.hash = "";
    if (!urls.includes(url.href)) urls.push(url.href);
  }
  return { urls, rejected };
}
