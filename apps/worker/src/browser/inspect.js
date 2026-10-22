// Runs inside the scanned page. Kept as plain JS (not compiled by tsx) so
// page.evaluate gets exactly this source.
//
// Input:  { targets: string[][] }  — axe node targets
// Output: { targets: Location[], images: ImageInfo[], links: LinkInfo[], insecure: InsecureResource[], anchors: string[] }
(function inspect({ targets }) {
  const MODULE_WRAPPER = ".hs_cos_wrapper_widget, .hs_cos_wrapper_type_module";
  // Editor-owned content: fixed in the post/page editor or CTA tool, not in theme code.
  const CONTENT_FIELD = ".hs_cos_wrapper_meta_field.hs_cos_wrapper_type_rich_text";
  const CTA = ".hs-cta-wrapper";
  const GLOBAL_LANDMARK = "header, footer, [role=banner], [role=contentinfo]";
  const SKIP_TAGS = new Set(["STYLE", "SCRIPT", "LINK", "NOSCRIPT", "TEMPLATE"]);
  const MAX_PATH = 5;

  // Classes that change per page or per state and would break dedupe.
  function isStableClass(c) {
    return (
      !/\d{4,}/.test(c) &&
      !/^hs_cos_wrapper/.test(c) &&
      !/^widget_/.test(c) &&
      !/^(is|has)-/.test(c) &&
      !/^(active|open|show|visible|hidden|selected|current)$/.test(c)
    );
  }

  function isBlockClass(c) {
    return isStableClass(c) && !c.includes("__") && !c.includes("--");
  }

  function firstContentChild(el) {
    for (const child of el.children) if (!SKIP_TAGS.has(child.tagName)) return child;
    return null;
  }

  function wrapperName(wrapper) {
    const typeClass = [...wrapper.classList].find((c) => c.startsWith("hs_cos_wrapper_type_"));
    const type = typeClass ? typeClass.slice("hs_cos_wrapper_type_".length) : "module";

    if (type === "module") {
      // Root BEM block class of the module's first element, up to two levels deep.
      let node = firstContentChild(wrapper);
      for (let depth = 0; node && depth < 2; depth++) {
        const block = [...node.classList].find(isBlockClass);
        if (block) return { name: "." + block, named: true, type };
        node = firstContentChild(node);
      }
    } else {
      return { name: "HubSpot " + type.replace(/_/g, " "), named: true, type };
    }

    // Fallback: template-coded modules get readable IDs (hs_cos_wrapper_hero);
    // drag-and-drop ones are numeric (hs_cos_wrapper_widget_1678...).
    const id = (wrapper.id || "").replace(/^hs_cos_wrapper_/, "");
    if (id && !/^(widget_|module_)?\d+$/.test(id)) return { name: "#" + id, named: true, type };
    return { name: "#" + (wrapper.id || "unknown-module"), named: false, type };
  }

  function segment(el) {
    const classes = [...el.classList].filter(isStableClass).slice(0, 3);
    return el.tagName.toLowerCase() + classes.map((c) => "." + c).join("");
  }

  // A selector-like path from the anchor down to el, built from tags and stable
  // classes only, so the same element in the same module matches across pages.
  function stablePath(el, anchor) {
    const parts = [];
    let node = el;
    while (node && node !== anchor && node.nodeType === 1 && parts.length < MAX_PATH) {
      if (!node.classList.contains("hs_cos_wrapper")) parts.unshift(segment(node));
      node = node.parentElement;
    }
    return parts.join(" > ");
  }

  function locate(el) {
    if (!el) return { scope: "unknown", module: null, named: false, path: "", partial: null };

    const partialEl = el.closest("[data-global-resource-path]");
    const partial = partialEl ? partialEl.getAttribute("data-global-resource-path") : null;
    const isGlobal = Boolean(partialEl) || Boolean(el.closest(GLOBAL_LANDMARK));
    const wrapper = el.closest(MODULE_WRAPPER);

    const cta = el.closest(CTA);
    if (cta) {
      return { scope: "content", module: "HubSpot CTA", named: true, partial, path: stablePath(el, cta) };
    }

    const field = el.closest(CONTENT_FIELD);
    if (field && (!wrapper || !wrapper.contains(field))) {
      const id = (field.id || "").replace(/^hs_cos_wrapper_/, "");
      const name = id === "post_body" ? "Blog post body" : "Content field: " + (id || "rich text");
      return { scope: "content", module: name, named: true, partial, path: stablePath(el, field) };
    }

    if (wrapper) {
      const { name, named, type } = wrapperName(wrapper);
      return {
        scope: isGlobal ? "global" : "module",
        module: name,
        moduleType: type,
        named,
        partial,
        path: stablePath(el, wrapper),
      };
    }

    const anchor = partialEl || el.closest(GLOBAL_LANDMARK) || document.body;
    return {
      scope: isGlobal ? "global" : "template",
      module: null,
      named: false,
      partial,
      path: stablePath(el, anchor),
    };
  }

  function query(selector) {
    if (typeof selector !== "string") return null;
    try {
      return document.querySelector(selector);
    } catch {
      return null;
    }
  }

  function locateTarget(target) {
    if (!Array.isArray(target)) return locate(null);
    if (target.length === 1) return locate(query(target[0]));

    // Multi-part targets point into an iframe (or shadow root). For iframes the
    // fix lives with the embed provider, so group by its host.
    const host = query(target[0]);
    if (host && host.tagName === "IFRAME") {
      let provider = "iframe";
      try {
        provider = new URL(host.src, location.href).hostname.replace(/^www\./, "");
      } catch {}
      const where = locate(host);
      return { ...where, scope: "embed", module: provider, named: true, path: target.slice(1).join(" >>> ") };
    }
    return locate(host);
  }

  function nearbyHeading(el) {
    let node = el;
    for (let i = 0; node && i < 4; i++, node = node.parentElement) {
      const h = node.querySelector("h1, h2, h3, h4, h5, h6");
      if (h) return h.textContent.trim().slice(0, 300);
    }
    return null;
  }

  function isOnlyContentOfLink(img) {
    const link = img.closest("a");
    if (!link) return false;
    const otherImages = [...link.querySelectorAll("img")].filter((i) => i !== img);
    return link.textContent.trim() === "" && otherImages.length === 0 && !link.getAttribute("aria-label");
  }

  const images = [...document.querySelectorAll("img")].map((img) => {
    const figure = img.closest("figure");
    const caption = figure && figure.querySelector("figcaption");
    return {
      src: img.currentSrc || img.src,
      alt: img.getAttribute("alt"),
      role: img.getAttribute("role"),
      ariaHidden: img.closest("[aria-hidden=true]") !== null,
      onlyContentOfLink: isOnlyContentOfLink(img),
      caption: caption ? caption.textContent.trim().slice(0, 300) : null,
      heading: nearbyHeading(img),
      location: locate(img),
    };
  });

  const links = [...document.querySelectorAll("a[href]")].map((a) => ({
    href: a.getAttribute("href"),
    resolved: a.href,
    text: (a.textContent || a.getAttribute("aria-label") || "").trim().slice(0, 200),
    location: locate(a),
  }));

  // Mixed content: http:// URLs in the markup. Read the attributes, not el.src,
  // because Chrome may already have upgraded an image to https.
  const insecure = [];
  function addInsecure(el, value, kind) {
    if (!value) return;
    let url;
    try {
      url = new URL(value.trim(), document.baseURI);
    } catch {
      return;
    }
    if (url.protocol === "http:") insecure.push({ url: url.href, kind, location: locate(el) });
  }
  function linkKind(link) {
    const rel = (link.getAttribute("rel") || "").toLowerCase();
    if (/stylesheet/.test(rel)) return "stylesheet";
    if (/icon/.test(rel)) return "image";
    if (/preload|prefetch/.test(rel)) {
      const as = (link.getAttribute("as") || "").toLowerCase();
      return ["script", "style", "font", "image"].includes(as) ? (as === "style" ? "stylesheet" : as) : null;
    }
    return null;
  }
  if (location.protocol === "https:") {
    for (const el of document.querySelectorAll("img[src], img[srcset], source[src], source[srcset]")) {
      const kind = el.tagName === "IMG" || el.closest("picture") ? "image" : "media";
      addInsecure(el, el.getAttribute("src"), kind);
      for (const candidate of (el.getAttribute("srcset") || "").split(",")) addInsecure(el, candidate.trim().split(/\s+/)[0], kind);
    }
    for (const el of document.querySelectorAll("script[src]")) addInsecure(el, el.getAttribute("src"), "script");
    for (const el of document.querySelectorAll("link[href]")) {
      const kind = linkKind(el);
      if (kind) addInsecure(el, el.getAttribute("href"), kind);
    }
    for (const el of document.querySelectorAll("iframe[src]")) addInsecure(el, el.getAttribute("src"), "iframe");
    for (const el of document.querySelectorAll("video[src], audio[src], video[poster]")) {
      addInsecure(el, el.getAttribute("src"), "media");
      addInsecure(el, el.getAttribute("poster"), "image");
    }
    for (const el of document.querySelectorAll("object[data], embed[src]")) addInsecure(el, el.getAttribute("data") || el.getAttribute("src"), "plugin");
    for (const el of document.querySelectorAll("form[action]")) addInsecure(el, el.getAttribute("action"), "form");
    for (const el of document.querySelectorAll("[style*='http:']")) {
      for (const m of el.getAttribute("style").matchAll(/url\(\s*['"]?(http:[^'")\s]+)/gi)) addInsecure(el, m[1], "image");
    }
  }

  // Fragment targets on this page, for the broken-anchor check: element IDs and <a name>.
  const anchors = [
    ...new Set([
      ...[...document.querySelectorAll("[id]")].map((el) => el.id),
      ...[...document.querySelectorAll("a[name]")].map((el) => el.getAttribute("name")),
    ]),
  ].filter(Boolean);

  return {
    targets: targets.map(locateTarget),
    images,
    links,
    insecure,
    anchors,
  };
})
