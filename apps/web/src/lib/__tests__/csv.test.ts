import assert from "node:assert/strict";
import { test } from "node:test";
import { csvCell, toCsv } from "../csv";

test("plain values pass through", () => {
  assert.equal(csvCell("hero-banner"), "hero-banner");
  assert.equal(csvCell(42), "42");
  assert.equal(csvCell(null), "");
});

test("quotes, commas and newlines are quoted and escaped", () => {
  assert.equal(csvCell('alt="logo"'), '"alt=""logo"""');
  assert.equal(csvCell("a, b"), '"a, b"');
  assert.equal(csvCell("line 1\nline 2"), '"line 1\nline 2"');
});

test("formula-looking text is neutralised", () => {
  assert.equal(csvCell("=HYPERLINK(\"http://x\")"), '"\'=HYPERLINK(""http://x"")"');
  assert.equal(csvCell("+1 555"), "'+1 555");
  assert.equal(csvCell("-cmd"), "'-cmd");
  assert.equal(csvCell("@SUM(A1)"), "'@SUM(A1)");
});

test("negative numbers are not mangled", () => assert.equal(csvCell(-3), "-3"));

test("document has BOM, header, CRLF rows", () => {
  assert.equal(toCsv(["A", "B"], [[1, "x"], [2, "y, z"]]), '﻿A,B\r\n1,x\r\n2,"y, z"\r\n');
});
