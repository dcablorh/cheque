// Twitter/X reads its own tag set; the artwork is identical to the Open Graph card.
export const runtime = 'nodejs';
export const revalidate = 60;
export const contentType = 'image/png';
export const size = { width: 1200, height: 630 };

export { alt } from './opengraph-image';
export { default } from './opengraph-image';
