import assert from "node:assert/strict";
import { test } from "node:test";
import { imageKind, type FlaggedImage } from "../src/checks/alt.js";
import { suggestAltFix } from "../src/fixes.js";

const img = (over: Partial<FlaggedImage>): FlaggedImage => ({
  src: "https://a.com/hubfs/wind-turbine-inspection.jpg",
  alt: null,
  linkHref: null,
  width: 600,
  height: 400,
  caption: null,
  heading: null,
  checks: ["missing"],
  worstSeverity: "critical",
  location: { scope: "module", module: ".case-study-hero", named: true, partial: null, path: "img" },
  pages: ["https://a.com/"],
  ...over,
});

test("image kind from file name, alt, module and size", () => {
  assert.equal(imageKind(img({ src: "https://a.com/hubfs/acme-logo.svg" })), "logo");
  assert.equal(imageKind(img({ width: 24, height: 24 })), "icon");
  assert.equal(imageKind(img({ src: "https://a.com/hubfs/q2-growth-chart.png" })), "chart");
  assert.equal(imageKind(img({ src: "https://a.com/hubfs/jo-smith-headshot.jpg" })), "person");
  assert.equal(imageKind(img({ src: "https://a.com/hubfs/dashboard-screenshot.png" })), "screenshot");
  assert.equal(imageKind(img({})), "photo");
  assert.equal(imageKind(img({ src: "https://a.com/hubfs/Screen%20Shot%202019-12-11%20at%2011.29.41%20am.png" })), "photo", "a capture's name says nothing");
  assert.equal(imageKind(img({ src: "https://a.com/hubfs/Screen%20Shot%202019-12-11.png", width: 56, height: 56 })), "icon");
});

test("missing alt: names the file, gives a kind-specific example and where to edit", () => {
  const [fix] = suggestAltFix(img({ src: "https://a.com/hubfs/acme-logo.svg" }));
  assert.match(fix.summary, /"acme-logo"/);
  assert.match(fix.steps[0], /^Good alt for a logo: the organisation's name/);
  assert.ok(fix.steps.some((s) => s.includes(".case-study-hero") && s.includes("module.image.alt")));
});

test("a linked logo keeps the logo advice", () => {
  const [fix] = suggestAltFix(img({ src: "https://a.com/hubfs/acme-logo.svg", alt: "acme-logo", checks: ["filename"], linkHref: "https://a.com/" }));
  assert.match(fix.steps[0], /^Good alt for a logo:.*home/);
});

test("linked images are told to name the destination", () => {
  const [fix] = suggestAltFix(img({ alt: "", checks: ["empty-linked"], linkHref: "https://a.com/work/acme" }));
  assert.match(fix.summary, /link to \/work\/acme/);
  assert.match(fix.steps[0], /links to \/work\/acme/);
});

test("quotes the bad alt and says which nearby text it repeats; content images point at the editor", () => {
  const fixes = suggestAltFix(
    img({
      alt: "Our team",
      heading: "Our Team",
      checks: ["redundant"],
      location: { scope: "content", module: "Blog post body", named: true, partial: null, path: "img" },
    }),
  );
  assert.match(fixes[0].summary, /Alt "Our team" repeats the heading/);
  assert.ok(fixes[0].steps.some((s) => /rich text/.test(s)));
});
