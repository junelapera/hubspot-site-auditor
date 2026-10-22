import assert from "node:assert/strict";
import { test } from "node:test";
import { checkAlt } from "../src/checks/alt.js";
import type { ImageInfo } from "../src/types.js";

const img = (over: Partial<ImageInfo>): ImageInfo => ({
  src: "https://example.com/hubfs/team-photo.jpg",
  alt: "Our team at the 2025 offsite",
  role: null,
  ariaHidden: false,
  onlyContentOfLink: false,
  caption: null,
  heading: null,
  location: { scope: "module", module: ".hero", named: true, partial: null, path: "img" },
  ...over,
});

test("good alt passes", () => assert.deepEqual(checkAlt(img({})), []));
test("missing alt", () => assert.deepEqual(checkAlt(img({ alt: null })), ["missing"]));
test("decorative empty alt passes", () => assert.deepEqual(checkAlt(img({ alt: "" })), []));
test("empty alt on linked image", () =>
  assert.deepEqual(checkAlt(img({ alt: "", onlyContentOfLink: true })), ["empty-linked"]));
test("aria-hidden is skipped", () => assert.deepEqual(checkAlt(img({ alt: null, ariaHidden: true })), []));

test("filename with extension", () => assert.deepEqual(checkAlt(img({ alt: "IMG_4021.jpg" })), ["filename"]));
test("camera name without extension", () => assert.deepEqual(checkAlt(img({ alt: "DSC_0042" })), ["filename"]));
test("machine-like alt equals file stem", () => assert.deepEqual(checkAlt(img({ alt: "team-photo" })), ["filename"]));
test("readable alt that matches file stem passes", () =>
  assert.deepEqual(checkAlt(img({ alt: "Customer Success", src: "https://x.com/Customer%20Success.svg" })), []));
test("screenshot name", () =>
  assert.deepEqual(checkAlt(img({ alt: "Screen Shot 2019-12-11 at 11.29.41 am" })), ["filename"]));

test("generic words", () => {
  for (const alt of ["image", "Photo", "banner", "logo", "image 2"]) assert.deepEqual(checkAlt(img({ alt })), ["generic"], alt);
});
test("descriptive alt containing a generic word passes", () =>
  assert.deepEqual(checkAlt(img({ alt: "Salted Stone logo" })), []));

test("too long", () => assert.deepEqual(checkAlt(img({ alt: "a ".repeat(80) + "end" })), ["too-long"]));
test("redundant with caption", () =>
  assert.deepEqual(checkAlt(img({ alt: "Our team", caption: "Our team." })), ["redundant"]));
