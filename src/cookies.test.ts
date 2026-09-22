import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseSdLast, parseSdSpots, serializeSdLast, isLocalhost } from "./cookies";

describe("sd_last round-trip", () => {
  test("serializes then parses back the same value", () => {
    const value = { name: "Loosdrecht", lat: 52.2, lon: 5.08, gps: true };
    const setCookie = serializeSdLast(value, { secure: true });
    const cookieHeader = setCookie.split(";")[0]!; // "sd_last=<encoded>"
    assert.deepEqual(parseSdLast(cookieHeader), value);
  });

  test("includes Secure unless the request is to localhost", () => {
    const value = { name: "X", lat: 1, lon: 1, gps: false };
    assert.match(serializeSdLast(value, { secure: true }), /; Secure/);
    assert.doesNotMatch(serializeSdLast(value, { secure: false }), /; Secure/);
  });

  test("always sets 90-day Max-Age, Path=/, SameSite=Lax", () => {
    const setCookie = serializeSdLast({ name: "X", lat: 1, lon: 1, gps: false }, { secure: true });
    assert.match(setCookie, /Max-Age=7776000/);
    assert.match(setCookie, /Path=\//);
    assert.match(setCookie, /SameSite=Lax/);
  });
});

describe("parseSdLast - defensive parsing", () => {
  test("missing cookie header -> null", () => {
    assert.equal(parseSdLast(null), null);
  });

  test("cookie not present among others -> null", () => {
    assert.equal(parseSdLast("other=1; another=2"), null);
  });

  test("invalid JSON -> null, never throws", () => {
    assert.equal(parseSdLast("sd_last=" + encodeURIComponent("{not json")), null);
  });

  test("malformed percent-encoding -> null, never throws", () => {
    assert.equal(parseSdLast("sd_last=%zz"), null);
  });

  test("out-of-range lat -> null", () => {
    const raw = encodeURIComponent(JSON.stringify({ name: "X", lat: 999, lon: 5, gps: false }));
    assert.equal(parseSdLast(`sd_last=${raw}`), null);
  });

  test("out-of-range lon -> null", () => {
    const raw = encodeURIComponent(JSON.stringify({ name: "X", lat: 5, lon: -200, gps: false }));
    assert.equal(parseSdLast(`sd_last=${raw}`), null);
  });

  test("non-string name -> null", () => {
    const raw = encodeURIComponent(JSON.stringify({ name: 123, lat: 5, lon: 5, gps: false }));
    assert.equal(parseSdLast(`sd_last=${raw}`), null);
  });

  test("missing gps coerces to false", () => {
    const raw = encodeURIComponent(JSON.stringify({ name: "X", lat: 5, lon: 5 }));
    assert.deepEqual(parseSdLast(`sd_last=${raw}`), { name: "X", lat: 5, lon: 5, gps: false });
  });

  test("reads sd_last among multiple cookies", () => {
    const raw = encodeURIComponent(JSON.stringify({ name: "X", lat: 5, lon: 5, gps: true }));
    assert.deepEqual(parseSdLast(`other=1; sd_last=${raw}; another=2`), { name: "X", lat: 5, lon: 5, gps: true });
  });
});

describe("parseSdSpots - defensive parsing", () => {
  test("missing cookie -> empty array", () => {
    assert.deepEqual(parseSdSpots(null), []);
  });

  test("not an array -> empty array", () => {
    const raw = encodeURIComponent(JSON.stringify({ name: "X" }));
    assert.deepEqual(parseSdSpots(`sd_spots=${raw}`), []);
  });

  test("invalid JSON -> empty array, never throws", () => {
    assert.deepEqual(parseSdSpots("sd_spots=" + encodeURIComponent("[not json")), []);
  });

  test("drops invalid entries, keeps valid ones", () => {
    const raw = encodeURIComponent(
      JSON.stringify([
        { name: "Good", lat: 52, lon: 5 },
        { name: "BadLat", lat: 999, lon: 5 },
        "not an object",
        { name: 42, lat: 1, lon: 1 },
      ])
    );
    assert.deepEqual(parseSdSpots(`sd_spots=${raw}`), [{ name: "Good", lat: 52, lon: 5 }]);
  });

  test("caps at 8 entries, newest first as given", () => {
    const spots = Array.from({ length: 12 }, (_, i) => ({ name: `Spot${i}`, lat: 1, lon: 1 }));
    const raw = encodeURIComponent(JSON.stringify(spots));
    const parsed = parseSdSpots(`sd_spots=${raw}`);
    assert.equal(parsed.length, 8);
    assert.equal(parsed[0]!.name, "Spot0");
    assert.equal(parsed[7]!.name, "Spot7");
  });
});

describe("isLocalhost", () => {
  test("localhost and 127.0.0.1 are local", () => {
    assert.ok(isLocalhost(new URL("http://localhost:8787/")));
    assert.ok(isLocalhost(new URL("http://127.0.0.1:8787/")));
  });

  test("a real domain is not local", () => {
    assert.ok(!isLocalhost(new URL("https://supdawg.nl/")));
  });
});
