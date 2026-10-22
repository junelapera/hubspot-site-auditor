import assert from "node:assert/strict";
import { test } from "node:test";
import { modulesInHtml, pickSample } from "../src/sample.js";

const page = `
<div data-global-resource-path="theme/partials/header.html">
  <div id="hs_cos_wrapper_navigation-primary" class="hs_cos_wrapper hs_cos_wrapper_widget hs_cos_wrapper_type_module"><nav class="menu menu--desktop"></nav></div>
</div>
<div id="hs_cos_wrapper_widget_1752612731445" class="hs_cos_wrapper hs_cos_wrapper_widget hs_cos_wrapper_type_module"><style> .hero-mod { color: red } a < b </style>
  <!-- module -->
  <link rel="stylesheet" href="x.css">
  <section class="hero-mod is-active"><h1>Hi</h1></section></div>
<div id="hs_cos_wrapper_widget_1752612731446" class="hs_cos_wrapper hs_cos_wrapper_widget hs_cos_wrapper_type_module"><div class="widget_1752612731446"><div class="cards__item cards"></div></div></div>
<span id="hs_cos_wrapper_post_body" class="hs_cos_wrapper hs_cos_wrapper_meta_field hs_cos_wrapper_type_rich_text">Text</span>
<div id="hs_cos_wrapper_dnd_area-module-3" class="hs_cos_wrapper hs_cos_wrapper_widget hs_cos_wrapper_type_form"></div>`;

test("names modules like the browser scanner: root block class, two levels deep", () => {
  assert.deepEqual(modulesInHtml(page).sort(), [
    "#navigation-primary",
    "#post_body",
    ".cards",
    ".hero-mod",
    ".menu",
    "HubSpot form",
    "HubSpot rich text",
    "partial:theme/partials/header.html",
  ]);
});

test("greedy cover: fewest pages for every module, shortest URL on a tie, capped by limit", () => {
  const pages = [
    { url: "https://a.com/blog/post-1", modules: ["header", "post"] },
    { url: "https://a.com/blog/post-2", modules: ["header", "post"] },
    { url: "https://a.com/", modules: ["header", "hero", "cards"] },
    { url: "https://a.com/contact-us", modules: ["header", "form"] },
    { url: "https://a.com/about", modules: ["header", "form"] },
  ];
  assert.deepEqual(pickSample(pages, 10), {
    urls: ["https://a.com/", "https://a.com/about", "https://a.com/blog/post-1"],
    covered: 5,
    total: 5,
  });
  assert.deepEqual(pickSample(pages, 1).urls, ["https://a.com/"]);
  assert.deepEqual(pickSample([{ url: "https://a.com/", modules: [] }], 5).urls, ["https://a.com/"]);
});
