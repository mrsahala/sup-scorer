import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { thumbTiles } from "./tiles";

const PDOK_HOST = "https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/standaard/EPSG:3857/";

describe("thumbTiles", () => {
  // Loosdrecht, hand-computed at zoom 12: x=2105.7991111111114, y=1349.2662195218743
  // (Web Mercator tile formula), so tx=floor(x-0.5)=2105, ty=floor(y-0.5)=1348.
  test("a known point matches hand-computed tile indices and offsets", () => {
    const { urls, left, top } = thumbTiles(52.2, 5.08);
    assert.deepEqual(urls, [
      `${PDOK_HOST}12/2105/1348.png`,
      `${PDOK_HOST}12/2106/1348.png`,
      `${PDOK_HOST}12/2105/1349.png`,
      `${PDOK_HOST}12/2106/1349.png`,
    ]);
    assert.equal(left, -176.57);
    assert.equal(top, -296.15);
  });

  // tx/ty are always chosen half a tile back from the point, so px/py (the
  // point's position within the top-left tile, in pixels) never falls
  // within 128px of either edge of the 512px mosaic.
  test("px/py (derived from the offsets) always land in [128, 384)", () => {
    const points: [number, number][] = [
      [52.2, 5.08],
      [52.373, 4.533],
      [51.94, 4.51],
      [53.2, 6.5],
      [50.8, 5.7],
      [0, 0],
      [-33.9, 151.2],
    ];
    for (const [lat, lon] of points) {
      const { left, top } = thumbTiles(lat, lon);
      const px = 28 - left;
      const py = 28 - top;
      assert.ok(px >= 128 && px < 384, `px=${px} out of range for (${lat},${lon})`);
      assert.ok(py >= 128 && py < 384, `py=${py} out of range for (${lat},${lon})`);
    }
  });

  test("always returns exactly four tile URLs on the PDOK host", () => {
    const { urls } = thumbTiles(51.94, 4.51);
    assert.equal(urls.length, 4);
    for (const url of urls) assert.ok(url.startsWith(PDOK_HOST));
  });
});
