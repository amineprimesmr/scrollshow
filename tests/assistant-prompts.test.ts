import assert from "node:assert/strict";
import { test } from "node:test";
import { scrollshowStarterPrompt } from "../lib/assistant-prompts";

for (const english of [false, true]) {
  test(`starter prompt is actionable and credential-free (${english ? "en" : "fr"})`, () => {
    const prompt = scrollshowStarterPrompt(english);
    for (const name of ["whoami", "get_content_brief", "list_posts", "create_post", 'status="draft"', "recipe"]) assert.ok(prompt.includes(name));
    assert.doesNotMatch(prompt, /ss_live_|key=|Bearer |https?:\/\//);
    assert.match(prompt, english ? /does not install/ : /ne suffit pas à installer/);
    assert.match(prompt, english ? /without my explicit request/ : /sans ma demande explicite/);
  });
}
