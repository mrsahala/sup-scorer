// Progressive enhancement for the server-rendered conditions page: ribbon
// scrub, the spot switcher, the GPS button, the star, and chip glance badges.
//
// Everything here mutates markup the server already rendered - nothing is
// re-rendered and no HTML is ever built from a string, so the page keeps
// working with this file blocked or broken.
//
// Per-page values come only from the #page-data blob; shapes and class names
// are the DOM contract in docs/plans/ribbon-ux.md section 3.

const SVG_NS = "http://www.w3.org/2000/svg";
const TIERS = ["great", "good", "marginal", "poor", "avoid"];

const Y_MAX = 40; // km/h; the fixed vertical scale ribbon.tsx draws every day to
const SPOT_EPSILON = 1e-4; // ~10 m: the tolerance render.tsx compares two spots with
const MAX_SPOTS = 8; // cookies.ts stops reading past the eighth entry
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const SEARCH_DEBOUNCE_MS = 200;
const FOCUS_DELAY_MS = 60; // let the switcher start opening, so focus doesn't scroll the collapsed box
const POP_MS = 220; // the .star transform transition in style.css
const TITLE_RESET_MS = 2500; // long enough to read the failure, short enough not to go stale
const GPS_TIMEOUT_MS = 8000;
const GPS_MAX_AGE_MS = 10 * 60 * 1000; // a ten-minute-old fix still names the right spot

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
const finite = (v) => (Number.isFinite(v) ? v : 0);

// The server's rounding, exactly: one decimal, trailing zeros dropped.
const r1 = (v) => Math.round(v * 10) / 10;
const pct = (fraction) => `${Math.round(fraction * 10000) / 100}%`;
const yPct = (kmh) => pct(1 - clamp(finite(kmh), 0, Y_MAX) / Y_MAX);

const fmt = (template, vars) => template.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
const shortName = (name) => String(name).split(",")[0].trim();
const sameSpot = (a, b) => Math.abs(a.lat - b.lat) < SPOT_EPSILON && Math.abs(a.lon - b.lon) < SPOT_EPSILON;
const conditionsUrl = (locale, s) =>
  `/${locale}/conditions?lat=${s.lat}&lon=${s.lon}&name=${encodeURIComponent(s.name)}`;

function setText(el, text) {
  if (el) el.textContent = text;
}

function readPageData() {
  const el = document.getElementById("page-data");
  if (!el) return null;
  try {
    const data = JSON.parse(el.textContent);
    return data && Array.isArray(data.days) ? data : null;
  } catch {
    return null;
  }
}

// ---------- detail strip ----------

// Why this hour isn't "great" - the same order and rounding as reasonText in ribbon.tsx.
function reason(h, s) {
  if (h.gustDowngraded) return fmt(s.reasonGust, { gust: String(Math.round(finite(h.gustKmh))) });
  if (h.coldLimited) return fmt(s.reasonCold, { temp: String(Math.round(finite(h.tempC))) });
  if (h.tier !== "great") return fmt(s.reasonSustained, { wind: String(Math.round(finite(h.windKmh))) });
  return "";
}

// Rewrites the text of the strip DetailStrip rendered rather than rebuilding it:
// the localized unit, the "°C" and the markup then stay exactly as the server
// emitted them, and the strip can't reformat itself on the first scrub.
function fillDetail(detail, h, strings) {
  const its = detail.querySelectorAll(".it");
  const dir = finite(h.windDirDeg);

  detail.className = `detail tier-${h.tier}`;
  setText(detail.querySelector(".tm"), h.hour);
  setText(detail.querySelector(".vd"), (strings.tiers[h.tier] || h.tier) + (h.gustDowngraded ? "*" : ""));
  if (its[0]) setText(its[0].querySelector(".mono"), `${r1(finite(h.windKmh))} → ${r1(finite(h.gustKmh))}`);
  if (its[1]) setText(its[1].querySelector(".mono"), `${r1(finite(h.tempC))}°C`);
  if (its[2]) {
    const compass = strings.compass[Math.round(dir / 45) % 8] || "";
    // The leading text node is "from WNW " - the trailing space before the arrow.
    if (its[2].firstChild) its[2].firstChild.nodeValue = `${fmt(strings.detailFrom, { compass })} `;
    const arrow = its[2].querySelector(".ar");
    if (arrow) arrow.style.setProperty("--rot", `${(dir + 180) % 360}deg`);
  }
  setText(detail.querySelector(".why"), reason(h, strings));
}

// ---------- ribbon scrub ----------

// Hover previews an hour, press/drag selects continuously and the selection
// stays where the pointer lifts. Same model for mouse and touch, no modes.
function wireRibbon(rb, detail, hours, strings) {
  const n = hours.length;
  const chart = rb.querySelector(".chart");
  const cursor = rb.querySelector(".cursor");
  const colHi = rb.querySelector(".col-hi");
  const dot = cursor && cursor.querySelector("i");
  if (!chart || !cursor || !colHi || !dot) return;

  let sel = clamp(parseInt(rb.dataset.sel, 10) || 0, 0, n - 1);
  let shown = sel;
  let dragging = false;

  const showHour = (i) => {
    const h = hours[i];
    if (!h) return;
    cursor.style.setProperty("--x", pct((i + 0.5) / n));
    dot.style.setProperty("--y", yPct(h.windKmh));
    colHi.style.setProperty("--x", pct(i / n));
    fillDetail(detail, h, strings);
    shown = i;
  };
  const select = (i) => {
    sel = i;
    rb.dataset.sel = String(i);
    showHour(i);
  };

  // Hour columns span .chart, which is narrower than .ribbon wherever the
  // threshold labels sit outside the chart.
  const idxAt = (clientX) => {
    const r = chart.getBoundingClientRect();
    if (!r.width) return -1;
    return clamp(Math.floor(((clientX - r.left) / r.width) * n), 0, n - 1);
  };

  rb.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    dragging = true;
    const i = idxAt(e.clientX);
    if (i >= 0) select(i);
    // Capture keeps a drag that wanders off the ribbon reporting here. It
    // throws if the pointer is already gone, which must not lose the tap.
    try {
      rb.setPointerCapture(e.pointerId);
    } catch {
      dragging = false;
    }
  });
  rb.addEventListener("pointermove", (e) => {
    const i = idxAt(e.clientX);
    if (i < 0 || i === shown) return;
    if (dragging) select(i);
    else if (e.pointerType === "mouse") showHour(i);
  });
  const end = () => {
    dragging = false;
  };
  rb.addEventListener("pointerup", end);
  rb.addEventListener("pointercancel", end);
  rb.addEventListener("pointerleave", () => {
    if (!dragging) showHour(sel);
  });
  rb.addEventListener("keydown", (e) => {
    const last = n - 1;
    let i;
    if (e.key === "ArrowLeft") i = sel - 1;
    else if (e.key === "ArrowRight") i = sel + 1;
    else if (e.key === "Home") i = 0;
    else if (e.key === "End") i = last;
    else return;
    e.preventDefault();
    select(clamp(i, 0, last));
  });
}

function wireRibbons(page) {
  const byDate = new Map(page.days.map((d) => [d.date, d]));
  for (const card of document.querySelectorAll(".card[data-date]")) {
    const day = byDate.get(card.dataset.date);
    const rb = card.querySelector(".ribbon");
    const detail = card.querySelector(".detail");
    if (day && day.hours.length && rb && detail) wireRibbon(rb, detail, day.hours, page.strings);
  }
}

// ---------- switcher ----------

function pinIcon() {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "ic");
  svg.setAttribute("viewBox", "0 0 20 20");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linejoin", "round");
  const outline = document.createElementNS(SVG_NS, "path");
  outline.setAttribute("d", "M10 18s6-5.2 6-10a6 6 0 10-12 0c0 4.8 6 10 6 10z");
  const hole = document.createElementNS(SVG_NS, "circle");
  hole.setAttribute("cx", "10");
  hole.setAttribute("cy", "8");
  hole.setAttribute("r", "2.2");
  svg.append(outline, hole);
  return svg;
}

function wireSwitcher(page) {
  const tb = document.getElementById("title-block");
  const btn = document.getElementById("spot-btn");
  const input = document.getElementById("search");
  const results = document.getElementById("results");
  const hint = document.getElementById("hint");
  if (!tb || !btn || !input || !results || !hint) return;

  let found = [];
  let active = -1;
  let timer = 0;
  let seq = 0;

  const open = () => {
    tb.dataset.open = "true";
    btn.setAttribute("aria-expanded", "true");
    setTimeout(() => input.focus({ preventScroll: true }), FOCUS_DELAY_MS);
  };
  const close = () => {
    tb.dataset.open = "false";
    btn.setAttribute("aria-expanded", "false");
    input.value = "";
    found = [];
    active = -1;
    results.replaceChildren();
    hint.hidden = true;
  };

  const highlight = () => {
    [...results.children].forEach((row, i) => {
      row.classList.toggle("active", i === active);
      row.setAttribute("aria-selected", i === active ? "true" : "false");
    });
  };

  const renderResults = () => {
    results.replaceChildren(
      ...found.map((r) => {
        const row = document.createElement("a");
        row.className = "row";
        row.setAttribute("role", "option");
        row.href = conditionsUrl(page.locale, r);
        const name = document.createElement("span");
        name.className = "nm";
        name.textContent = r.name;
        const type = document.createElement("span");
        type.className = "ty";
        type.textContent = r.type || "";
        row.append(pinIcon(), name, type);
        return row;
      })
    );
    highlight();
  };

  const search = async (q) => {
    const mine = ++seq;
    try {
      const resp = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (!resp.ok) throw new Error(String(resp.status));
      const body = await resp.json();
      if (mine !== seq) return;
      found = Array.isArray(body) ? body.filter((r) => r && typeof r.name === "string") : [];
      active = found.length ? 0 : -1;
      hint.textContent = page.strings.noMatches;
      hint.hidden = found.length > 0;
      renderResults();
    } catch {
      if (mine !== seq) return;
      hint.textContent = page.strings.searchFailed;
      hint.hidden = false;
    }
  };

  btn.addEventListener("click", () => (tb.dataset.open === "true" ? close() : open()));
  document.addEventListener("pointerdown", (e) => {
    if (tb.dataset.open !== "true") return;
    if (e.target instanceof Element && e.target.closest("#title-block")) return;
    close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && tb.dataset.open === "true") {
      close();
      btn.focus();
    }
  });

  input.addEventListener("input", () => {
    const q = input.value.trim();
    clearTimeout(timer);
    if (!q) {
      seq++;
      found = [];
      active = -1;
      results.replaceChildren();
      hint.hidden = true;
      return;
    }
    timer = setTimeout(() => search(q), SEARCH_DEBOUNCE_MS);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" && found.length) {
      e.preventDefault();
      active = (active + 1) % found.length;
      highlight();
    } else if (e.key === "ArrowUp" && found.length) {
      e.preventDefault();
      active = (active - 1 + found.length) % found.length;
      highlight();
    } else if (e.key === "Enter") {
      e.preventDefault();
      const row = results.children[active >= 0 ? active : 0];
      if (row) window.location.assign(row.href);
    }
  });
}

// ---------- GPS ----------

function wireGps(page) {
  const btn = document.getElementById("gps");
  if (!btn) return;
  const idleTitle = btn.getAttribute("title") || "";

  btn.addEventListener("click", () => {
    if (!navigator.geolocation || btn.classList.contains("busy")) return;
    btn.classList.add("busy");
    btn.title = page.strings.locating;
    navigator.geolocation.getCurrentPosition(
      (p) => {
        // No name: /conditions reverse-geocodes the point server-side.
        window.location.assign(
          `/${page.locale}/conditions?lat=${p.coords.latitude}&lon=${p.coords.longitude}&src=gps`
        );
      },
      () => {
        btn.classList.remove("busy");
        btn.title = page.strings.locationFailed;
        setTimeout(() => (btn.title = idleTitle), TITLE_RESET_MS);
      },
      { timeout: GPS_TIMEOUT_MS, maximumAge: GPS_MAX_AGE_MS }
    );
  });
}

// ---------- saved spots ----------

function readCookie(name) {
  for (const part of document.cookie.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1 || part.slice(0, eq).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(eq + 1).trim());
    } catch {
      return "";
    }
  }
  return "";
}

function readSpots() {
  try {
    const v = JSON.parse(readCookie("sd_spots"));
    if (!Array.isArray(v)) return [];
    return v
      .filter((s) => s && typeof s.name === "string" && Number.isFinite(s.lat) && Number.isFinite(s.lon))
      .map((s) => ({ name: s.name, lat: s.lat, lon: s.lon }));
  } catch {
    return [];
  }
}

function writeSpots(spots) {
  const value = encodeURIComponent(JSON.stringify(spots.slice(0, MAX_SPOTS)));
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `sd_spots=${value}; Max-Age=${COOKIE_MAX_AGE}; Path=/; SameSite=Lax${secure}`;
}

async function fillGlance(locale, chip) {
  const badge = chip.querySelector("small");
  const { lat, lon } = chip.dataset;
  if (!badge || !lat || !lon) return;
  try {
    const resp = await fetch(
      `/api/glance?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&lang=${encodeURIComponent(locale)}`
    );
    if (!resp.ok) return;
    const g = await resp.json();
    badge.textContent = typeof g.text === "string" ? g.text : "";
    if (TIERS.includes(g.tier)) chip.classList.add(`tier-${g.tier}`);
  } catch {
    // The chip stays a plain link with no badge.
  }
}

function addChip(page, spot) {
  const chips = document.getElementById("chips");
  if (!chips) return;
  const chip = document.createElement("a");
  chip.className = "chip active"; // the starred spot is the one being looked at
  chip.href = conditionsUrl(page.locale, spot);
  chip.dataset.lat = String(spot.lat);
  chip.dataset.lon = String(spot.lon);
  const name = document.createElement("span");
  name.textContent = shortName(spot.name);
  chip.append(document.createElement("i"), name, document.createElement("small"));
  chips.prepend(chip);
  fillGlance(page.locale, chip);
}

function removeChip(spot) {
  const chips = document.getElementById("chips");
  if (!chips) return;
  for (const chip of chips.querySelectorAll(".chip")) {
    const at = { lat: Number(chip.dataset.lat), lon: Number(chip.dataset.lon) };
    if (sameSpot(at, spot)) chip.remove();
  }
}

function wireStar(page) {
  const btn = document.getElementById("star");
  if (!btn) return;
  const spot = { name: page.spot.name, lat: page.spot.lat, lon: page.spot.lon };

  btn.addEventListener("click", () => {
    const spots = readSpots();
    const at = spots.findIndex((s) => sameSpot(s, spot));
    const saved = at === -1;
    if (saved) spots.unshift(spot);
    else spots.splice(at, 1);
    writeSpots(spots);

    btn.setAttribute("aria-pressed", saved ? "true" : "false");
    btn.setAttribute("aria-label", saved ? page.strings.unsaveSpot : page.strings.saveSpot);
    btn.classList.add("pop");
    setTimeout(() => btn.classList.remove("pop"), POP_MS);

    if (saved) addChip(page, spot);
    else removeChip(spot);
  });
}

function wireChips(page) {
  const chips = document.getElementById("chips");
  if (!chips) return;
  for (const chip of chips.querySelectorAll(".chip")) fillGlance(page.locale, chip);
}

// ---------- boot ----------

const page = readPageData();
if (page) {
  wireRibbons(page);
  wireSwitcher(page);
  wireGps(page);
  wireStar(page);
  wireChips(page);
}
