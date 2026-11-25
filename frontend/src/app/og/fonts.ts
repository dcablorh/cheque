import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Fonts for the Open Graph images (`next/og` / satori). Satori cannot read the
 * `next/font` CSS variables, so the same families are read from disk here.
 *
 * Google's `latin` subset has no ₦ (U+20A6) or ₵ (U+20B5); the `latin-ext`
 * files carry those glyphs only. They are registered as separate families so
 * satori can fall back per glyph via `fontFamily: 'Inter, InterExt'`.
 *
 * `outputFileTracingIncludes` in next.config.mjs keeps src/app/fonts in the
 * deployed function bundle. If a read fails we simply render without the font.
 */
export interface OgFont {
  name: string;
  data: ArrayBuffer;
  weight: 400 | 500 | 600 | 700;
  style: 'normal';
}

const FILES: { file: string; name: string; weight: OgFont['weight'] }[] = [
  { file: 'antonio-latin-700-normal.woff', name: 'Antonio', weight: 700 },
  { file: 'inter-latin-500-normal.woff', name: 'Inter', weight: 500 },
  { file: 'inter-latin-600-normal.woff', name: 'Inter', weight: 600 },
  { file: 'inter-latin-ext-600-normal.woff', name: 'InterExt', weight: 600 },
  { file: 'dm-mono-latin-500-normal.woff', name: 'DMMono', weight: 500 },
  { file: 'dm-mono-latin-ext-500-normal.woff', name: 'DMMonoExt', weight: 500 },
];

let cached: OgFont[] | null = null;

export async function loadOgFonts(): Promise<OgFont[]> {
  if (cached) return cached;
  const dir = path.join(process.cwd(), 'src', 'app', 'fonts');
  const loaded = await Promise.all(
    FILES.map(async (f) => {
      try {
        const buf = await readFile(path.join(dir, f.file));
        const data = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
        return { name: f.name, data: data as ArrayBuffer, weight: f.weight, style: 'normal' as const };
      } catch {
        return null;
      }
    })
  );
  cached = loaded.filter((f): f is OgFont => f !== null);
  return cached;
}
