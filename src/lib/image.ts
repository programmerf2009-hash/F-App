/* ==========================================================================
   Profil rasmi — tanlangan faylni markazdan kvadrat qirqib, 512×512 JPEG
   data URL'ga aylantiradi. Akkount yozuvi localStorage'da saqlanadi.
   ========================================================================== */

export const AVATAR_SIZE = 512;
export const MAX_PHOTO_BYTES = 20 * 1024 * 1024;

function decode(file: File): Promise<ImageBitmap> {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file);
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image as unknown as ImageBitmap);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("This image could not be opened."));
    };
    image.src = url;
  });
}

export async function fileToAvatar(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Choose an image file (JPG, PNG or WebP).");
  }
  if (file.size > MAX_PHOTO_BYTES) {
    throw new Error("Image is larger than 20 MB.");
  }

  let source: ImageBitmap;
  try {
    source = await decode(file);
  } catch {
    throw new Error("This image format is not supported. Try JPG or PNG.");
  }

  const width = source.width;
  const height = source.height;
  if (!width || !height) {
    throw new Error("This image could not be opened.");
  }

  const side = Math.min(width, height);
  const sx = (width - side) / 2;
  const sy = (height - side) / 2;

  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Image processing is not available in this browser.");
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);

  if (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap) {
    source.close();
  }

  return canvas.toDataURL("image/jpeg", 0.86);
}
