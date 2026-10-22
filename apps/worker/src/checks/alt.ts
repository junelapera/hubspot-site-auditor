import type { ImageInfo, Location, PageResult } from "../types.js";

export type AltCheck = "missing" | "filename" | "generic" | "empty-linked" | "too-long" | "redundant";
export type AltSeverity = "critical" | "serious" | "minor";

export const ALT_SEVERITY: Record<AltCheck, AltSeverity> = {
  missing: "critical",
  filename: "serious",
  generic: "serious",
  "empty-linked": "serious",
  "too-long": "minor",
  redundant: "minor",
};

export const MAX_ALT_LENGTH = 150;

// Tunable: the PRD's main alt-text risk is false positives from this list.
export const GENERIC_ALT_WORDS = new Set([
  "image", "img", "photo", "photograph", "picture", "pic", "graphic", "banner", "logo",
  "icon", "thumbnail", "placeholder", "hero", "header", "untitled", "default", "featured image",
]);

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|svg|avif|bmp|tiff?)$/i;
const CAMERA_NAME = /^(img|dsc|dscn|dcim|pxl|screen ?shot|screenshot|photo|image)[\s_-]*\d{3,}/i;

export interface FlaggedImage {
  src: string;
  alt: string | null;
  checks: AltCheck[];
  worstSeverity: AltSeverity;
  location: Location;
  pages: string[];
}

export function checkAlt(img: ImageInfo): AltCheck[] {
  // Hidden or explicitly decorative images are out of scope.
  if (img.ariaHidden || img.role === "presentation" || img.role === "none") return [];

  if (img.alt === null) return ["missing"];

  const alt = img.alt.trim();
  if (alt === "") return img.onlyContentOfLink ? ["empty-linked"] : [];

  const checks: AltCheck[] = [];
  if (isFilenameAlt(alt, img.src)) checks.push("filename");
  else if (GENERIC_ALT_WORDS.has(normalize(alt).replace(/\s*\d+$/, ""))) checks.push("generic");
  if (alt.length > MAX_ALT_LENGTH) checks.push("too-long");
  if (isRedundant(alt, img)) checks.push("redundant");
  return checks;
}

export function isFilenameAlt(alt: string, src: string): boolean {
  if (IMAGE_EXT.test(alt) || CAMERA_NAME.test(alt)) return true;
  // Only machine-looking alts count ("hero-bg_2", "badge-1"). A readable name
  // reused as the file name ("Customer Success.svg") is usually good alt.
  const machineLike = !/\s/.test(alt) && /[-_\d]/.test(alt);
  const file = fileStem(src);
  return machineLike && file !== "" && normalize(alt) === normalize(file);
}

function isRedundant(alt: string, img: ImageInfo): boolean {
  const a = normalize(alt);
  return [img.caption, img.heading].some((t) => t && normalize(t) === a);
}

function fileStem(src: string): string {
  try {
    const name = decodeURIComponent(new URL(src).pathname.split("/").pop() ?? "");
    return name.replace(IMAGE_EXT, "");
  } catch {
    return "";
  }
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[_\-.]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Flag images across all pages, deduped by image + module so a shared image shows once with its pages. */
export function auditImages(pages: PageResult[]): FlaggedImage[] {
  const flagged = new Map<string, FlaggedImage>();
  const rank: Record<AltSeverity, number> = { critical: 3, serious: 2, minor: 1 };

  for (const page of pages) {
    for (const img of page.images) {
      const checks = checkAlt(img);
      if (!checks.length) continue;

      const key = [img.src.split("?")[0], img.alt, img.location.scope, img.location.module].join("|");
      const existing = flagged.get(key);
      if (existing) {
        if (!existing.pages.includes(page.url)) existing.pages.push(page.url);
        continue;
      }
      flagged.set(key, {
        src: img.src,
        alt: img.alt,
        checks,
        worstSeverity: checks.map((c) => ALT_SEVERITY[c]).reduce((a, b) => (rank[b] > rank[a] ? b : a)),
        location: img.location,
        pages: [page.url],
      });
    }
  }
  return [...flagged.values()];
}
