// Covers the ribbon's DOM contract (docs/plans/ribbon-ux.md section 3): segment
// counts and spans, the per-date clip path id, finite geometry everywhere, the
// selected hour's detail, the today-only now marker, and JSX escaping.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import render from "preact-render-to-string";
import { Ribbon, DetailStrip, DayCard, monotone, xAt, yAt, defaultSel } from "./ribbon";
import { scoreHour, type ScoredHour } from "./scoring";
import type { HourRow } from "./weather";
import { findWindows } from "./windows";

const TODAY = "2026-09-20";

function row(date: string, hourNum: number, windKmh: number, extra: Partial<HourRow> = {}): HourRow {
  return {
    time: `${date}T${String(hourNum).padStart(2, "0")}:00`,
    date,
    hour: `${String(hourNum).padStart(2, "0")}:00`,
    hourNum,
    tempC: 18,
    windKmh,
    gustKmh: windKmh,
    windDirDeg: 225,
    weatherCode: 0,
    cloudPct: 0,
    rainMm: 0,
    rainPct: 0,
    isDaylight: true,
    sunrise: "07:23",
    sunset: "19:40",
    ...extra,
  };
}

// winds pick the tier: 8 great, 13 good, 18 marginal, 23 poor, 30 avoid.
function makeDay(date: string, winds: number[], startHour = 8): ScoredHour[] {
  return winds.map((w, i) => scoreHour(row(date, startHour + i, w)));
}

// 12 daylight hours -> a 5h window of marginal+good (mode good), a 2h great
// window, a 1h marginal window, separated by non-qualifying poor hours.
const MIXED = [23, 18, 18, 13, 13, 13, 23, 23, 8, 8, 23, 18];
const mixedDay = makeDay(TODAY, MIXED);

const countMatches = (html: string, re: RegExp) => html.match(re)?.length ?? 0;

describe("Ribbon strip", () => {
  const html = render(<Ribbon locale="en" day={TODAY} hours={mixedDay} sel={3} />);

  test("one seg per non-window hour plus one per window", () => {
    const windows = findWindows(mixedDay);
    const windowHours = windows.reduce((sum, w) => sum + w.hours.length, 0);
    assert.equal(windows.length, 3);
    assert.equal(
      countMatches(html, /class="seg[ "]/g),
      mixedDay.length - windowHours + windows.length
    );
  });

  test("--span sums to the hour count", () => {
    const spans = [...html.matchAll(/--span:(\d+)/g)].map((m) => Number(m[1]));
    assert.equal(
      spans.reduce((a, b) => a + b, 0),
      mixedDay.length
    );
  });

  test("window segs carry a localized label, plain hours do not", () => {
    assert.ok(html.includes("<b>Good 5h</b>"));
    assert.ok(html.includes("<b>Great 2h</b>"));
    const nl = render(<Ribbon locale="nl" day={TODAY} hours={mixedDay} sel={3} />);
    assert.ok(nl.includes("<b>Goed 5u</b>"));
  });
});

describe("Ribbon geometry", () => {
  test("the clip path id is unique per date and referenced by the tier columns", () => {
    const a = render(<Ribbon locale="en" day="2026-09-20" hours={mixedDay} sel={0} />);
    const b = render(<Ribbon locale="en" day="2026-09-21" hours={makeDay("2026-09-21", MIXED)} sel={0} />);
    assert.ok(a.includes('id="area-2026-09-20"'));
    assert.ok(a.includes('clip-path="url(#area-2026-09-20)"'));
    assert.ok(b.includes('id="area-2026-09-21"'));
    assert.ok(!b.includes("area-2026-09-20"));
  });

  test("the wipe clip id is unique per date and wraps the curves and tints", () => {
    const a = render(<Ribbon locale="en" day="2026-09-20" hours={mixedDay} sel={0} />);
    const b = render(<Ribbon locale="en" day="2026-09-21" hours={makeDay("2026-09-21", MIXED)} sel={0} />);
    assert.ok(a.includes('id="wipe-2026-09-20"'));
    assert.ok(a.includes('class="wipe" clip-path="url(#wipe-2026-09-20)"'));
    assert.ok(b.includes('id="wipe-2026-09-21"'));
    assert.ok(!b.includes("wipe-2026-09-20"));
    // wind-line and tier columns sit inside the wiped group, not before it.
    const wiped = /<g class="wipe"[^>]*>([\s\S]*?)<\/svg>/.exec(a)?.[1] ?? "";
    assert.ok(wiped.includes('class="wind-line"'));
    assert.ok(wiped.includes('class="tier-col'));
  });

  test("no NaN, Infinity or undefined anywhere in the output", () => {
    for (const hours of [mixedDay, makeDay(TODAY, [13]), makeDay(TODAY, [0, 80, 0])]) {
      const html = render(<Ribbon locale="en" day={TODAY} hours={hours} sel={0} />);
      assert.doesNotMatch(html, /NaN|Infinity|undefined/);
    }
  });

  test("an empty day renders nothing", () => {
    assert.equal(render(<Ribbon locale="en" day={TODAY} hours={[]} sel={0} />), "");
  });

  test("the fixed 0-40 km/h scale maps wind to viewBox y, clamping above 40", () => {
    assert.equal(yAt(0), 400);
    assert.equal(yAt(10), 300);
    assert.equal(yAt(40), 0);
    assert.equal(yAt(80), 0);
    assert.equal(xAt(0, 12), 1000 / 24);
  });

  test("monotone returns a cubic path through every point, empty below two points", () => {
    assert.equal(monotone([{ x: 0, y: 0 }]), "");
    const d = monotone([
      { x: 0, y: 100 },
      { x: 500, y: 200 },
      { x: 1000, y: 100 },
    ]);
    assert.ok(d.startsWith("M0 100"));
    assert.equal(countMatches(d, /C/g), 2);
    assert.doesNotMatch(d, /NaN/);
  });

  test("threshold guides sit at 10/15/20/25 km/h and the labels mirror them", () => {
    const html = render(<Ribbon locale="en" day={TODAY} hours={mixedDay} sel={0} />);
    for (const y of [300, 250, 200, 150]) assert.ok(html.includes(`y1="${y}" y2="${y}"`));
    assert.ok(html.includes('--y:75%">Great ≤10'));
    assert.ok(html.includes('--y:37.5%">Poor ≤25'));
  });

  test("carries the hour count as both data-n and --n, plus the selection overlays", () => {
    const html = render(<Ribbon locale="en" day={TODAY} hours={mixedDay} sel={3} />);
    assert.ok(html.includes('data-n="12"'));
    assert.ok(html.includes("--n:12"));
    assert.ok(html.includes('data-sel="3"'));
    assert.ok(html.includes("--x:25%;--w:8.33%"));
    assert.ok(html.includes("--x:29.17%"));
    assert.ok(html.includes("--y:67.5%")); // the selected hour's 13 km/h
  });

  test("one axis cell and one arrow per hour, labels on even hours only", () => {
    const html = render(<Ribbon locale="en" day={TODAY} hours={mixedDay} sel={0} />);
    const axis = /<div class="axis">(.*?)<\/div>/s.exec(html)?.[1] ?? "";
    assert.equal(countMatches(axis, /<span>/g), 12);
    assert.ok(axis.includes("<span>08</span><span></span><span>10</span>"));
    assert.equal(countMatches(html, /--rot:45deg/g), 12); // from 225deg, blowing towards NE
  });
});

describe("Ribbon now marker", () => {
  test("renders only when the current hour is inside daylight", () => {
    const today = render(
      <Ribbon locale="en" day={TODAY} hours={mixedDay} sel={3} nowIndex={3} nowFraction={0.35} />
    );
    assert.ok(today.includes('data-now="3.35"'));
    assert.ok(today.includes('class="now" style="--x:32.08%"'));
    assert.ok(today.includes("<b>now</b>"));
  });

  test("absent on other days and outside daylight", () => {
    for (const nowIndex of [-1, 12]) {
      const html = render(<Ribbon locale="en" day={TODAY} hours={mixedDay} sel={0} nowIndex={nowIndex} />);
      assert.ok(!html.includes("data-now"));
      assert.ok(!html.includes('class="now"'));
    }
  });
});

describe("DetailStrip", () => {
  test("shows the hour's own numbers, tier and reason", () => {
    const hour = scoreHour(row(TODAY, 11, 24.8, { gustKmh: 26.1, tempC: 17.5, windDirDeg: 270 }));
    const html = render(<DetailStrip locale="en" hour={hour} />);
    assert.ok(html.includes('class="detail tier-poor"'));
    assert.ok(html.includes("11:00"));
    assert.ok(html.includes("24.8 → 26.1"));
    assert.ok(html.includes('<span class="mono">18°C</span>'));
    assert.ok(html.includes("from W"));
    assert.ok(html.includes("sustained 25 km/h"));
  });

  test("a gust-limited hour is starred and says why", () => {
    const hour = scoreHour(row(TODAY, 12, 12, { gustKmh: 38 }));
    const html = render(<DetailStrip locale="en" hour={hour} />);
    assert.ok(html.includes("*"));
    assert.ok(html.includes("gust-limited · gusts 38 km/h"));
  });

  test("a cold hour says so, a great hour has an empty reason", () => {
    const cold = render(<DetailStrip locale="en" hour={scoreHour(row(TODAY, 9, 8, { tempC: 6 }))} />);
    assert.ok(cold.includes("too cold · 6°C"));
    const great = render(<DetailStrip locale="en" hour={scoreHour(row(TODAY, 9, 8))} />);
    assert.ok(great.includes('<span class="why"></span>'));
  });
});

describe("Ribbon conditions row", () => {
  // sun, partly, cloud, rain, likely rain at exactly 40%, a trace too small for a bar.
  const SKY: Partial<HourRow>[] = [
    { cloudPct: 10, tempC: 22 },
    { cloudPct: 50, tempC: 17 },
    { cloudPct: 96, rainPct: 30, tempC: 12 },
    { cloudPct: 90, rainMm: 1.8, rainPct: 90, tempC: 5 },
    { cloudPct: 40, rainMm: 0, rainPct: 40, tempC: 27.4 },
    { cloudPct: 20, rainMm: 0.05, rainPct: 39, tempC: 35 },
  ];
  const hours = SKY.map((extra, i) => scoreHour(row(TODAY, 10 + i, 8, extra)));
  const html = render(<Ribbon locale="en" day={TODAY} hours={hours} sel={2} />);
  const cond = /<div class="cond" aria-hidden="true">(.*?)<\/div>/.exec(html)?.[1] ?? "";
  const cells = cond.split('<span class="cell').slice(1);

  test("is the ribbon's first child, before the strip", () => {
    assert.match(html, /^<div class="ribbon"[^>]*><div class="cond" aria-hidden="true">/);
    assert.ok(html.indexOf('class="cond"') < html.indexOf('class="strip"'));
  });

  test("one cell per hour, with its sky class, heat color and number", () => {
    assert.equal(cells.length, hours.length);
    const heads = cells.map((c) => /^ ([^"]*)" style="--heat:([^"]+)">.*?<b>([^<]+)<\/b>/.exec(c)?.slice(1));
    assert.deepEqual(heads, [
      ["sky-sun", "rgb(240,192,75)", "22°"],
      ["sky-partly", "rgb(159,199,106)", "17°"],
      ["sky-cloud on", "rgb(90,167,217)", "12°"],
      ["sky-rain", "rgb(74,127,214)", "5°"],
      ["sky-partly", "rgb(239,134,60)", "27°"],
      ["sky-sun", "rgb(224,85,58)", "35°"],
    ]);
  });

  test("each cell carries its glyph", () => {
    assert.ok(cells[0]!.includes('<svg class="g" viewBox="-8 -8 16 16">'));
    assert.equal(countMatches(cells[0]!, /class="g-ray"/g), 8);
    assert.ok(cells[1]!.includes('class="g-sun"') && cells[1]!.includes('class="g-cloud"'));
    assert.ok(cells[2]!.includes('class="g-cloud dark"') && !cells[2]!.includes("g-drop"));
    assert.equal(countMatches(cells[3]!, /class="g-drop"/g), 3);
  });

  test("the on cell is the selected hour, and only that one", () => {
    assert.ok(html.includes('data-sel="2"'));
    assert.equal(countMatches(cond, / on"/g), 1);
    const other = render(<Ribbon locale="en" day={TODAY} hours={hours} sel={5} />);
    assert.ok(other.includes('data-sel="5"') && other.includes('class="cell sky-sun on"'));
  });

  test("a rain bar only above 0.05 mm, sized by the amount", () => {
    assert.equal(countMatches(cond, /class="rain"/g), 1);
    assert.ok(cells[3]!.includes('<i class="rain" style="--mm:0.45"></i>'));
    assert.ok(!cells[5]!.includes("rain"));
    const heavy = render(<Ribbon locale="en" day={TODAY} hours={[scoreHour(row(TODAY, 9, 8, { rainMm: 12 }))]} sel={0} />);
    assert.ok(heavy.includes('<i class="rain" style="--mm:1"></i>'));
  });

  test("a likely-rain line only from 40% with no rain", () => {
    assert.equal(countMatches(cond, /class="rain maybe"/g), 1);
    assert.ok(cells[4]!.includes('<i class="rain maybe"></i>'));
    assert.ok(!cells[2]!.includes("maybe"));
  });

  test("numbers follow the unit", () => {
    const f = render(<Ribbon locale="en" day={TODAY} hours={hours} sel={0} unit="F" />);
    const nums = [...f.matchAll(/<b>(-?\d+°)<\/b>/g)].map((m) => m[1]);
    assert.deepEqual(nums, ["72°", "63°", "54°", "41°", "81°", "95°"]);
  });

  test("missing values render finite", () => {
    const broken = hours.map((h) => ({ ...h, tempC: NaN, cloudPct: NaN, rainMm: NaN, rainPct: NaN }));
    const out = render(<DayCard locale="en" date={TODAY} hours={broken} today={TODAY} />);
    assert.doesNotMatch(out, /NaN|Infinity|undefined/);
  });
});

describe("Fahrenheit", () => {
  test("the detail strip's temperature and cold reason follow the unit", () => {
    const html = render(<DetailStrip locale="en" hour={scoreHour(row(TODAY, 9, 8, { tempC: 6 }))} unit="F" />);
    assert.ok(html.includes('<span class="mono">43°F</span>'));
    assert.ok(html.includes("too cold · 43°F"));
    assert.ok(!html.includes("°C"));
  });

  test("the day card's meta line and alt text follow the unit", () => {
    const html = render(<DayCard locale="en" date={TODAY} hours={mixedDay} today={TODAY} unit="F" />);
    assert.ok(html.includes('<span class="mono">64–64</span>°F · sunrise'));
    assert.ok(html.includes("· 64–64°F ·"));
    assert.ok(!html.includes("°C"));
  });

  test("Celsius is the default", () => {
    const html = render(<DayCard locale="en" date={TODAY} hours={mixedDay} today={TODAY} />);
    assert.ok(html.includes('<span class="mono">18–18</span>°C · sunrise'));
  });
});

describe("DetailStrip sky", () => {
  const strip = (extra: Partial<HourRow>, locale: "en" | "nl" = "en") =>
    render(<DetailStrip locale={locale} hour={scoreHour(row(TODAY, 9, 8, extra))} />);

  test("cloud and rain follow the from span, before the reason", () => {
    const html = strip({ cloudPct: 96, rainMm: 3, rainPct: 90 });
    assert.ok(
      html.includes(
        '</svg></span><span class="it"><span class="mono">96%</span> cloud</span>' +
          '<span class="it"><span class="mono">3 mm</span> rain · <span class="mono">90%</span></span><span class="why">'
      )
    );
  });

  test("rain rounds to one decimal", () => {
    assert.ok(strip({ rainMm: 0.46, rainPct: 55 }).includes('<span class="mono">0.5 mm</span> rain · <span class="mono">55%</span>'));
  });

  test("a trace under 0.05 mm reads 0 mm, and keeps its chance from 10%", () => {
    assert.ok(strip({ rainMm: 0.04, rainPct: 40 }).includes('<span class="mono">0 mm</span> rain · <span class="mono">40%</span>'));
    assert.ok(strip({ rainMm: 0, rainPct: 10 }).includes('<span class="mono">0 mm</span> rain · <span class="mono">10%</span>'));
  });

  test("the chance is dropped under 10%", () => {
    assert.ok(strip({ rainMm: 0, rainPct: 9 }).includes('<span class="it"><span class="mono">0 mm</span> rain</span>'));
    assert.ok(strip({ rainMm: 0.3, rainPct: 5 }).includes('<span class="it"><span class="mono">0.3 mm</span> rain</span>'));
  });

  test("the spans are localized", () => {
    const html = strip({ cloudPct: 50, rainMm: 1, rainPct: 70 }, "nl");
    assert.ok(html.includes('<span class="mono">50%</span> bewolking'));
    assert.ok(html.includes('<span class="mono">1 mm</span> regen · <span class="mono">70%</span>'));
  });
});

describe("DayCard", () => {
  test("header, pill and meta line describe the day", () => {
    const html = render(<DayCard locale="en" date={TODAY} hours={mixedDay} today={TODAY} sel={3} />);
    assert.ok(html.includes('<section class="card" data-date="2026-09-20">'));
    assert.ok(html.includes("Today<small>20 Sept</small>"));
    assert.ok(html.includes('<span class="pill tier-good"><i></i>Good <span class="mono">09–14</span></span>'));
    assert.ok(html.includes('wind <span class="mono">8–23</span> km/h'));
    assert.ok(html.includes('sunrise <span class="mono">07:23</span> · sunset <span class="mono">19:40</span>'));
    assert.doesNotMatch(html, /NaN|Infinity|undefined/);
  });

  test("an all-day and a no-window day get their own pills", () => {
    const allDay = render(
      <DayCard locale="en" date={TODAY} hours={makeDay(TODAY, Array(6).fill(8))} today={TODAY} />
    );
    assert.ok(allDay.includes("Great all day"));
    const none = render(
      <DayCard locale="en" date={TODAY} hours={makeDay(TODAY, Array(6).fill(30))} today={TODAY} />
    );
    assert.ok(none.includes('<span class="pill none">No window</span>'));
  });

  test("the detail strip matches the selected hour", () => {
    const html = render(<DayCard locale="en" date={TODAY} hours={mixedDay} today={TODAY} sel={8} />);
    assert.ok(html.includes('data-sel="8"'));
    assert.ok(html.includes('class="detail tier-great"'));
    assert.ok(html.includes('<span class="tm">16:00</span>'));
  });

  test("defaults the selection to now on today, else the best window's start", () => {
    assert.equal(defaultSel(mixedDay, 5), 5);
    assert.equal(defaultSel(mixedDay, -1), 1); // the best (5h) window starts at index 1
    assert.equal(defaultSel(mixedDay, -1, true), 0); // today, past daylight
    assert.equal(defaultSel(makeDay(TODAY, Array(4).fill(30)), -1), 0);
  });

  test("an empty day renders nothing", () => {
    assert.equal(render(<DayCard locale="en" date={TODAY} hours={[]} today={TODAY} />), "");
  });
});

// Same property as render.test.tsx: "<" never survives unescaped. Preact leaves
// a lone ">" literal, which can't open a tag.
describe("XSS-shaped input is escaped, not executed", () => {
  test("a date flowing into data-date, the clip path id and the day label", () => {
    const XSS = '"><script>alert(1)</script>';
    const html = render(<DayCard locale="en" date={XSS} hours={mixedDay} today={TODAY} sel={0} />);
    assert.ok(!html.includes("<script>alert(1)</script>"));
    assert.ok(html.includes("&lt;script>"));
  });
});
