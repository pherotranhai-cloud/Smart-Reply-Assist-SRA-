/**
 * Turns picked image files into data URLs small enough to keep in
 * localStorage alongside the rest of the user's preferences.
 *
 * Wallpapers are stored inline rather than uploaded, so a full-resolution
 * phone photo (3–8 MB) would blow the ~5 MB origin quota on its own. Each
 * image is drawn down to at most MAX_EDGE on its longest side and re-encoded
 * as JPEG. A worst-case 3000x2000 photo measured 414 KB at 1440px; at 1280px
 * with a cap of 8 the gallery's ceiling is roughly 2.6 MB, which leaves room
 * in the ~5 MB origin quota for history, vocabulary and the translation cache.
 */

const MAX_EDGE = 1280;
const QUALITY = 0.82;

/** Longest edge the stored copy is allowed to have, in CSS pixels. */
export const WALLPAPER_MAX_EDGE = MAX_EDGE;

/** How many wallpapers a user may keep, to stay clear of the storage quota. */
export const MAX_SAVED_WALLPAPERS = 8;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode image'));
    img.src = src;
  });
}

/** Downscales one image file to a JPEG data URL. */
export async function fileToScaledDataUrl(file: File): Promise<string> {
  const original = await readAsDataUrl(file);
  const img = await loadImage(original);

  const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return original;          // no 2d context — keep the original
  ctx.drawImage(img, 0, 0, w, h);

  const scaled = canvas.toDataURL('image/jpeg', QUALITY);
  // Re-encoding a small PNG can make it larger; keep whichever is smaller.
  return scaled.length < original.length ? scaled : original;
}

export interface PickedImage {
  dataUrl: string;
  name: string;
}

/**
 * Processes a whole selection. Files that cannot be read are skipped rather
 * than failing the batch, and the reasons are returned for the caller to show.
 */
export async function filesToScaledImages(
  files: FileList | File[]
): Promise<{ images: PickedImage[]; failed: string[] }> {
  const list = Array.from(files).filter(f => f.type.startsWith('image/'));
  const images: PickedImage[] = [];
  const failed: string[] = [];

  for (const file of list) {
    try {
      const dataUrl = await fileToScaledDataUrl(file);
      images.push({ dataUrl, name: file.name.replace(/\.[^.]+$/, '').slice(0, 40) || 'Ảnh' });
    } catch {
      failed.push(file.name);
    }
  }
  return { images, failed };
}
