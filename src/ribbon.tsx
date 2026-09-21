// One day's wind ribbon: the window strip, the SVG curves, the hour axis and
// arrows, and the detail strip under it. Markup follows the DOM contract in
// docs/plans/ribbon-ux.md section 3 exactly - public/style.css and public/app.js
// are written against it. Geometry is ported from renderRibbon in the Ribbon
// UX prototype, converted from measured pixels to percentages and a fixed
// viewBox so the ribbon is responsive without any client-side measuring.
import { Fragment } from "preact";
import type { ComponentChildren, JSX } from "preact";
import { t, compassLabel, dateLocale, dayLabel, type Locale } from "./i18n";
import type { ScoredHour } from "./scoring";
import { daySummary, findWindows, type DaySummary } from "./windows";
import type { Tier } from "./config";

const Y_MAX = 40; // km/h; the same vertical scale on every day, so shapes compare
const VB_W = 1000;
const VB_H = 400;
const THRESHOLDS: [Tier, number][] = [
  ["great", 10],
  ["good", 15],
  ["marginal", 20],
  ["poor", 25],
];

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
const pct = (fraction: number) => `${r2(fraction * 100)}%`;
const pad2 = (v: number) => String(v).padStart(2, "0");
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
const finite = (v: number, fallback = 0) => (Number.isFinite(v) ? v : fallback);

interface Point {
  x: number;
  y: number;
}

// Horizontal center of hour i, in viewBox units.
export function xAt(i: number, n: number): number {
  return ((i + 0.5) / n) * VB_W;
}

// Wind speed -> viewBox y, clamped to the 0-Y_MAX scale.
export function yAt(kmh: number): number {
  return VB_H - (clamp(finite(kmh), 0, Y_MAX) / Y_MAX) * VB_H;
}

// The same scale as a percentage from the top, for the HTML overlays.
export function yPct(kmh: number): string {
  return pct(1 - clamp(finite(kmh), 0, Y_MAX) / Y_MAX);
}

// The arrow points where the wind is blowing TO; windDirDeg is where it blows FROM.
const arrowRotation = (deg: number) => (finite(deg) + 180) % 360;

// Fritsch-Carlson monotone cubic through the points, as an SVG path.
export function monotone(p: Point[]): string {
  const n = p.length;
  if (n < 2) return "";
  const dx: number[] = [];
  const m: number[] = [];
  const tan: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = p[i + 1]!.x - p[i]!.x;
    m[i] = (p[i + 1]!.y - p[i]!.y) / dx[i]!;
  }
  tan[0] = m[0]!;
  tan[n - 1] = m[n - 2]!;
  for (let i = 1; i < n - 1; i++) tan[i] = m[i - 1]! * m[i]! <= 0 ? 0 : (m[i - 1]! + m[i]!) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      tan[i] = 0;
      tan[i + 1] = 0;
      continue;
    }
    const a = tan[i]! / m[i]!;
    const b = tan[i + 1]! / m[i]!;
    const s = a * a + b * b;
    if (s > 9) {
      const tau = 3 / Math.sqrt(s);
      tan[i] = tau * a * m[i]!;
      tan[i + 1] = tau * b * m[i]!;
    }
  }
  let d = `M${r1(p[0]!.x)} ${r1(p[0]!.y)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i]! / 3;
    d += ` C${r1(p[i]!.x + h)} ${r1(p[i]!.y + h * tan[i]!)} ${r1(p[i + 1]!.x - h)} ${r1(
      p[i + 1]!.y - h * tan[i + 1]!
    )} ${r1(p[i + 1]!.x)} ${r1(p[i + 1]!.y)}`;
  }
  return d;
}

function tierLabel(locale: Locale, tier: Tier): string {
  switch (tier) {
    case "great":
      return t(locale, "tierGreat");
    case "good":
      return t(locale, "tierGood");
    case "marginal":
      return t(locale, "tierMarginal");
    case "poor":
      return t(locale, "tierPoor");
    case "avoid":
      return t(locale, "tierAvoid");
  }
}

// Splits a t() template on its {placeholders} so the values render as JSX
// children (auto-escaped) instead of needing dangerouslySetInnerHTML.
export function interpolate(template: string, nodes: Record<string, ComponentChildren>): ComponentChildren[] {
  return template.split(/(\{\w+\})/).map((part, i) => {
    const key = /^\{(\w+)\}$/.exec(part)?.[1];
    return key !== undefined && key in nodes ? <Fragment key={i}>{nodes[key]}</Fragment> : part;
  });
}

// The ranges shown in the meta line, also used as the ribbon's alt text.
function metaValues(hours: ScoredHour[]): { wind: string; temp: string; sunrise: string; sunset: string } {
  const range = (vals: number[]) =>
    vals.length ? `${Math.round(Math.min(...vals))}–${Math.round(Math.max(...vals))}` : "–";
  return {
    wind: range(hours.map((h) => h.windKmh).filter(Number.isFinite)),
    temp: range(hours.map((h) => h.tempC).filter(Number.isFinite)),
    sunrise: hours[0]?.sunrise || "–",
    sunset: hours[0]?.sunset || "–",
  };
}

// Why this hour isn't "great" - mirrors reason() in the prototype.
function reasonText(locale: Locale, h: ScoredHour): string {
  if (h.gustDowngraded) return t(locale, "reasonGust", { gust: String(Math.round(finite(h.gustKmh))) });
  if (h.coldLimited) return t(locale, "reasonCold", { temp: String(Math.round(finite(h.tempC))) });
  if (h.tier !== "great") return t(locale, "reasonSustained", { wind: String(Math.round(finite(h.windKmh))) });
  return "";
}

function ArrowIcon({ cls, rot }: { cls?: string; rot?: number }): JSX.Element {
  return (
    <svg
      class={cls}
      style={rot === undefined ? undefined : `--rot:${rot}deg`}
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M6 10V2M3 5l3-3 3 3" />
    </svg>
  );
}

// today -> the current hour, or 0 once it's past daylight; any other day -> the
// start of its best window.
export function defaultSel(hours: ScoredHour[], nowIndex: number, isToday = false): number {
  if (nowIndex >= 0 && nowIndex < hours.length) return nowIndex;
  if (isToday) return 0;
  const best = daySummary(hours).best;
  if (!best) return 0;
  return Math.max(0, hours.findIndex((h) => h.hourNum === best.startHour));
}

export function Ribbon({
  locale,
  day,
  hours,
  sel,
  nowIndex = -1,
  nowFraction = 0,
}: {
  locale: Locale;
  day: string;
  hours: ScoredHour[];
  sel: number;
  nowIndex?: number;
  nowFraction?: number;
}): JSX.Element | null {
  const n = hours.length;
  if (!n) return null;

  const selIdx = clamp(Math.trunc(finite(sel)), 0, n - 1);
  const selHour = hours[selIdx]!;
  const showNow = Number.isInteger(nowIndex) && nowIndex >= 0 && nowIndex < n;
  const nowAt = nowIndex + clamp(finite(nowFraction), 0, 1);
  const areaId = `area-${day}`;

  const extended = (key: "windKmh" | "gustKmh"): Point[] => [
    { x: 0, y: yAt(hours[0]![key]) },
    ...hours.map((h, i) => ({ x: xAt(i, n), y: yAt(h[key]) })),
    { x: VB_W, y: yAt(hours[n - 1]![key]) },
  ];
  const windPts = extended("windKmh");
  const gustPts = extended("gustKmh");
  const windLine = monotone(windPts);
  const windArea = `${windLine} L${VB_W} ${VB_H} L0 ${VB_H} Z`;
  const gustBand = `${monotone(gustPts)} ${monotone([...windPts].reverse()).replace(/^M/, "L")} Z`;
  const wipeId = `wipe-${day}`;

  const windowStarts = new Map(
    [...findWindows(hours)].sort((a, b) => a.startHour - b.startHour).map((w) => [w.startHour, w])
  );
  const segs: JSX.Element[] = [];
  for (let i = 0; i < n; i++) {
    const h = hours[i]!;
    const win = windowStarts.get(h.hourNum);
    if (win && win.date === h.date) {
      segs.push(
        <span key={h.time} class={`seg win tier-${win.modeTier}`} style={`--span:${win.hours.length}`}>
          <b>
            {t(locale, "windowLabel", {
              tier: tierLabel(locale, win.modeTier),
              hours: String(win.hours.length),
            })}
          </b>
        </span>
      );
      i += win.hours.length - 1;
      continue;
    }
    segs.push(<span key={h.time} class={`seg tier-${h.tier}`} style="--span:1" />);
  }

  return (
    <div
      class="ribbon"
      tabindex={0}
      role="img"
      aria-label={t(locale, "metaLine", metaValues(hours))}
      data-n={n}
      data-sel={selIdx}
      data-now={showNow ? String(r2(nowAt)) : undefined}
      style={`--n:${n}`}
    >
      <div class="strip">{segs}</div>
      <div class="chart">
        <svg class="curves" viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="none" aria-hidden="true">
          <defs>
            {/* Animating the clip's width, not the group's, lets CSS drop the
                clip-path entirely for reduced motion. */}
            <clipPath id={wipeId}>
              <rect x="0" y="0" width={VB_W} height={VB_H}>
                <animate
                  attributeName="width"
                  from="0"
                  to={VB_W}
                  dur="0.55s"
                  fill="freeze"
                  calcMode="spline"
                  keySplines="0.2 0.8 0.2 1"
                />
              </rect>
            </clipPath>
            <clipPath id={areaId}>
              <path d={windArea} />
            </clipPath>
          </defs>
          <g class="guides">
            {THRESHOLDS.map(([, kmh]) => (
              <line key={kmh} y1={yAt(kmh)} y2={yAt(kmh)} x1="0" x2={VB_W} />
            ))}
          </g>
          <g class="wipe" clip-path={`url(#${wipeId})`}>
            <g clip-path={`url(#${areaId})`}>
              {hours.map((h, i) => (
                <rect
                  key={h.time}
                  class={`tier-col tier-${h.tier}`}
                  x={r1((i / n) * VB_W)}
                  width={r1(VB_W / n)}
                  y="0"
                  height={VB_H}
                />
              ))}
            </g>
            <path class="gust-band" d={gustBand} />
            <path class="gust-line" d={monotone(gustPts)} vector-effect="non-scaling-stroke" />
            <path class="wind-line" d={windLine} vector-effect="non-scaling-stroke" />
          </g>
        </svg>
        <div class="guide-labels">
          {THRESHOLDS.map(([tier, kmh]) => (
            <span key={kmh} class={`tier-${tier}`} style={`--y:${yPct(kmh)}`}>
              {t(locale, "guideLabel", { tier: tierLabel(locale, tier), kmh: String(kmh) })}
            </span>
          ))}
        </div>
        <div class="key">
          <span class="k-wind">{t(locale, "keyWind")}</span>
          <span class="k-gust">{t(locale, "keyGust")}</span>
        </div>
        {showNow ? (
          <div class="now" style={`--x:${pct((nowAt + 0.5) / n)}`}>
            <b>{t(locale, "now")}</b>
          </div>
        ) : null}
        <div class="col-hi" style={`--x:${pct(selIdx / n)};--w:${pct(1 / n)}`} />
        <div class="cursor" style={`--x:${pct((selIdx + 0.5) / n)}`}>
          <i style={`--y:${yPct(selHour.windKmh)}`} />
        </div>
      </div>
      <div class="axis">
        {hours.map((h) => (
          <span key={h.time}>{h.hourNum % 2 === 0 || n <= 6 ? pad2(h.hourNum) : ""}</span>
        ))}
      </div>
      <div class="arrows">
        {hours.map((h) => (
          <span key={h.time} style={`--rot:${arrowRotation(h.windDirDeg)}deg`}>
            <ArrowIcon />
          </span>
        ))}
      </div>
    </div>
  );
}

export function DetailStrip({ locale, hour }: { locale: Locale; hour: ScoredHour }): JSX.Element {
  return (
    <div class={`detail tier-${hour.tier}`} aria-live="polite">
      <span class="tm">{hour.hour}</span>
      <span class="vd">
        {tierLabel(locale, hour.tier)}
        {hour.gustDowngraded ? "*" : ""}
      </span>
      <span class="it">
        <span class="mono">
          {r1(finite(hour.windKmh))} → {r1(finite(hour.gustKmh))}
        </span>{" "}
        {t(locale, "unitKmh")}
      </span>
      <span class="it">
        <span class="mono">{r1(finite(hour.tempC))}°C</span>
      </span>
      <span class="it">
        {t(locale, "detailFrom", { compass: compassLabel(locale, finite(hour.windDirDeg)) })}{" "}
        <ArrowIcon cls="ar" rot={arrowRotation(hour.windDirDeg)} />
      </span>
      <span class="why">{reasonText(locale, hour)}</span>
    </div>
  );
}

function Pill({ locale, summary }: { locale: Locale; summary: DaySummary }): JSX.Element {
  const best = summary.best;
  if (!best) return <span class="pill none">{t(locale, "pillNone")}</span>;
  const tier = tierLabel(locale, best.modeTier);
  if (summary.daylightHours > 0 && summary.qualifyingHours === summary.daylightHours) {
    return (
      <span class={`pill tier-${best.modeTier}`}>
        <i />
        {t(locale, "pillAllDay", { tier })}
      </span>
    );
  }
  return (
    <span class={`pill tier-${best.modeTier}`}>
      <i />
      {tier} <span class="mono">{`${pad2(best.startHour)}–${pad2(best.endHour)}`}</span>
    </span>
  );
}

// Dates come from weather.ts; a malformed one degrades to itself rather than throwing.
function dayHeading(locale: Locale, date: string, today: string): { label: string; sub: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { label: date, sub: "" };
  const [y, m, d] = date.split("-").map(Number);
  return {
    label: dayLabel(locale, date, today),
    sub: new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString(dateLocale(locale), {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    }),
  };
}

export function DayCard({
  locale,
  date,
  hours,
  today,
  sel,
  nowIndex = -1,
  nowFraction = 0,
}: {
  locale: Locale;
  date: string;
  hours: ScoredHour[];
  today: string;
  sel?: number;
  nowIndex?: number;
  nowFraction?: number;
}): JSX.Element | null {
  const n = hours.length;
  if (!n) return null;

  const selIdx = clamp(Math.trunc(finite(sel ?? defaultSel(hours, nowIndex, date === today))), 0, n - 1);
  const meta = metaValues(hours);
  const heading = dayHeading(locale, date, today);

  return (
    <section class="card" data-date={date}>
      <div class="card-h">
        <div class="day-l">
          {heading.label}
          <small>{heading.sub}</small>
        </div>
        <Pill locale={locale} summary={daySummary(hours)} />
      </div>
      <div class="meta">
        {interpolate(t(locale, "metaLine"), {
          wind: <span class="mono">{meta.wind}</span>,
          temp: <span class="mono">{meta.temp}</span>,
          sunrise: <span class="mono">{meta.sunrise}</span>,
          sunset: <span class="mono">{meta.sunset}</span>,
        })}
      </div>
      <Ribbon
        locale={locale}
        day={date}
        hours={hours}
        sel={selIdx}
        nowIndex={nowIndex}
        nowFraction={nowFraction}
      />
      <DetailStrip locale={locale} hour={hours[selIdx]!} />
    </section>
  );
}
