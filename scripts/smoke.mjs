// Checks a deployed site is actually usable, not just returning 200.
//
// Usage: node scripts/smoke.mjs [base-url]   (default: https://supdawg.nl)
//
// The class check is the reason this exists: unit tests pass happily while
// the markup and the stylesheet describe different pages, which renders a
// complete but entirely unstyled site.

const base = (process.argv[2] || "https://supdawg.nl").replace(/\/$/, "");

// Classes the markup sets for scripting or state, not for styling.
const UNSTYLED_OK = new Set(["picker", "mono", "wipe"]);

const failures = [];
const fail = (msg) => failures.push(msg);

async function get(path) {
  const res = await fetch(base + path, { redirect: "manual" });
  return { status: res.status, headers: res.headers, body: await res.text() };
}

async function expectStatus(path, want) {
  const { status } = await get(path);
  if (status !== want) fail(`${path} returned ${status}, expected ${want}`);
}

async function main() {
  const root = await get("/");
  if (root.status !== 302) fail(`/ returned ${root.status}, expected a redirect`);

  for (const path of ["/en/", "/nl/", "/de/", "/en/attribution"]) await expectStatus(path, 200);

  const css = await get("/style.css");
  if (css.status !== 200) fail(`/style.css returned ${css.status}`);

  const js = await get("/app.js");
  if (js.status !== 200) fail(`/app.js returned ${js.status}`);
  else if (!/javascript/.test(js.headers.get("content-type") || "")) {
    fail(`/app.js served as ${js.headers.get("content-type")}, not javascript`);
  }

  const page = await get("/en/");
  if (!/class="ribbon"/.test(page.body)) fail("/en/ has no ribbon - the page is not rendering conditions");
  if (!/tier-(great|good|marginal|poor|avoid)/.test(page.body)) fail("/en/ renders no scored hours");
  if (!/id="page-data"/.test(page.body)) fail("/en/ is missing the data the client script reads");

  // Every class the page uses should have a rule, or the page is unstyled.
  const used = new Set();
  for (const [, attr] of page.body.matchAll(/class="([^"]+)"/g)) {
    for (const name of attr.split(/\s+/)) if (name) used.add(name);
  }
  const unstyled = [...used].filter((n) => !UNSTYLED_OK.has(n) && !css.body.includes(`.${n}`));
  if (unstyled.length) fail(`classes with no CSS rule (is the stylesheet out of step?): ${unstyled.join(", ")}`);

  console.log(`${base}: ${failures.length ? `${failures.length} problem(s)` : "ok"}`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(failures.length ? 1 : 0);
}

main().catch((err) => {
  console.error(`smoke check could not run: ${err.message}`);
  process.exit(1);
});
