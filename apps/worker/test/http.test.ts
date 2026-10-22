import assert from "node:assert/strict";
import { test } from "node:test";
import { classify } from "../src/checks/links.js";
import { retryDelay } from "../src/http.js";

test("Retry-After seconds is honoured", () => assert.equal(retryDelay("5", 0), 5000));
test("Retry-After is capped at 30s", () => assert.equal(retryDelay("600", 0), 30_000));
test("backoff without Retry-After", () => assert.deepEqual([0, 1, 2].map((a) => retryDelay(null, a)), [2000, 4000, 8000]));

const hops = (...s: number[]) => s.map((status, i) => ({ url: `https://x.com/${i}`, status }));
test("429 is never reported as broken", () =>
  assert.deepEqual(classify({ url: "u", hops: hops(429), finalStatus: 429 }), ["not-checked"]));
test("404 is broken", () => assert.deepEqual(classify({ url: "u", hops: hops(404), finalStatus: 404 }), ["broken"]));
test("one redirect is fine", () => assert.deepEqual(classify({ url: "u", hops: hops(301, 200), finalStatus: 200 }), []));
test("two redirects is a chain", () =>
  assert.deepEqual(classify({ url: "u", hops: hops(301, 301, 200), finalStatus: 200 }), ["redirect-chain"]));
test("redirect to a 404", () =>
  assert.deepEqual(classify({ url: "u", hops: hops(301, 404), finalStatus: 404 }), ["redirect-to-dead"]));
