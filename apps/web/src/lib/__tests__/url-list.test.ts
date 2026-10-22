import assert from "node:assert/strict";
import { test } from "node:test";
import { parseUrlList } from "../url-list";

test("paths and URLs on the site's domain, normalised and deduped", () => {
  const { urls, rejected } = parseUrlList(
    "/about\nhttps://www.a.com/contact#form\nhttp://a.com/pricing\nwww.a.com/blog/post, /about\n\n",
    "www.a.com",
  );
  assert.deepEqual(urls, ["https://www.a.com/about", "https://www.a.com/contact", "https://www.a.com/pricing", "https://www.a.com/blog/post"]);
  assert.deepEqual(rejected, []);
});

test("other domains and junk are rejected with a reason", () => {
  const { urls, rejected } = parseUrlList("https://evil.com/x\nhttps://a.com.evil.com/\nhttp://[bad", "a.com");
  assert.deepEqual(urls, []);
  assert.deepEqual(rejected.map((r) => r.reason), ["not on a.com", "not on a.com", "not a URL or path"]);
});
