/* ==========================================================================
   Profil rasmi — tanlangan faylni markazdan kvadrat qirqib, 512×512 JPEG
   data URL'ga aylantiradi. Akkount yozuvi localStorage'da saqlanadi.
   ========================================================================== */

export const AVATAR_SIZE = 512;
export const MAX_PHOTO_BYTES = 20 * 1024 * 1024;
export const MAX_POST_PHOTO_BYTES = 25 * 1024 * 1024;
export const MAX_POST_PHOTO_SIDE = 1600;

function isImage(file: File): boolean {
  return (
    file.type.startsWith("image/") ||
    /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name)
  );
}

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
  if (!isImage(file)) {
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

export interface PreparedPhoto {
  blob: Blob;
  width: number;
  height: number;
}

/** Post/story rasmini eng katta tomoni 1600px bo'lguncha kichraytiradi. */
export async function fileToPostPhoto(file: File): Promise<PreparedPhoto> {
  if (!isImage(file)) {
    throw new Error("Choose an image file (JPG, PNG or WebP).");
  }
  if (file.size > MAX_POST_PHOTO_BYTES) {
    throw new Error("Photo is larger than 25 MB.");
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

  const scale = Math.min(1, MAX_POST_PHOTO_SIDE / Math.max(width, height));
  const outWidth = Math.max(1, Math.round(width * scale));
  const outHeight = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = outWidth;
  canvas.height = outHeight;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Image processing is not available in this browser.");
  }

  // JPEG shaffoflikni qo'llamaydi — oq fon beramiz.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, outWidth, outHeight);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, outWidth, outHeight);

  if (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap) {
    source.close();
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (next) => {
        if (next) resolve(next);
        else reject(new Error("Could not prepare this photo."));
      },
      "image/jpeg",
      0.88,
    );
  });

  return { blob, width: outWidth, height: outHeight };
}
