// Static map-thumbnail tile maths: a 2x2 PDOK tile mosaic centered on a point.

// Zoom 12: ~1.2km across the 56px thumbnail, showing shoreline and street
// pattern. 14 was tried first and rendered a single-color blob at this size.
const ZOOM = 12;
const THUMB_PX = 56; // the thumbnail's rendered width/height (style.css .map-thumb)
const TILE_PX = 256;

// The BRT achtergrondkaart standaard WMTS the retired map picker used.
const TILE_URL = (z: number, x: number, y: number): string =>
  `https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/standaard/EPSG:3857/${z}/${x}/${y}.png`;

export interface ThumbTiles {
  urls: [string, string, string, string];
  left: number;
  top: number;
}

// Fractional Web Mercator tile coordinates for (lat, lon) at zoom z.
function tileXY(lat: number, lon: number, z: number): { x: number; y: number } {
  const n = 2 ** z;
  const latRad = (lat * Math.PI) / 180;
  const x = ((lon + 180) / 360) * n;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return { x, y };
}

// A 2x2 tile mosaic (tx,ty), (tx+1,ty), (tx,ty+1), (tx+1,ty+1) with inline
// left/top offsets so the point sits centered in the 56px box before any
// script runs. tx/ty are chosen half a tile back from the point, so it's
// never within 128px (half a tile) of the mosaic's edge.
export function thumbTiles(lat: number, lon: number): ThumbTiles {
  const { x, y } = tileXY(lat, lon, ZOOM);
  const tx = Math.floor(x - 0.5);
  const ty = Math.floor(y - 0.5);
  const px = (x - tx) * TILE_PX;
  const py = (y - ty) * TILE_PX;
  // Rounded to a hundredth of a px: sub-pixel precision the eye can't see,
  // without the long float noise a raw division would put in the HTML.
  const round = (v: number) => Math.round(v * 100) / 100;
  return {
    urls: [
      TILE_URL(ZOOM, tx, ty),
      TILE_URL(ZOOM, tx + 1, ty),
      TILE_URL(ZOOM, tx, ty + 1),
      TILE_URL(ZOOM, tx + 1, ty + 1),
    ],
    left: round(THUMB_PX / 2 - px),
    top: round(THUMB_PX / 2 - py),
  };
}
