import assert from "node:assert/strict";
import { test } from "node:test";
import { extractTikTokHandle, findShortLink } from "../lib/library-add";

test("extracts handle from profile and video share links", () => {
  assert.equal(extractTikTokHandle("https://www.tiktok.com/@Some.Creator?_t=8abc&_r=1"), "some.creator");
  assert.equal(extractTikTokHandle("Regarde ça https://www.tiktok.com/@brand_x/video/7301234567890123456"), "brand_x");
  assert.equal(extractTikTokHandle("Check out @Nike's profile! https://www.tiktok.com/@nike"), "nike");
});

test("accepts bare handles and rejects noise", () => {
  assert.equal(extractTikTokHandle("@chef.marie"), "chef.marie");
  assert.equal(extractTikTokHandle("chef.marie"), "chef.marie");
  assert.equal(extractTikTokHandle("https://www.youtube.com/@someone"), "");
  assert.equal(extractTikTokHandle("just some text here"), "");
});

test("detects short links that need resolving", () => {
  assert.equal(findShortLink("https://vm.tiktok.com/ZMabc123/"), "https://vm.tiktok.com/ZMabc123/");
  assert.equal(findShortLink("look https://www.tiktok.com/t/ZTRabc/ now"), "https://www.tiktok.com/t/ZTRabc/");
  assert.equal(findShortLink("https://www.tiktok.com/@nike"), null);
});
