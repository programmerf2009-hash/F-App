/* ==========================================================================
   Video tekshiruvi — hajm, davomiylik va o'lchamni brauzerda o'qiydi.
   Post uchun 60 soniya, story uchun 15 soniya. Ikkalasi ham 40 MB gacha.
   ========================================================================== */

export const MAX_VIDEO_BYTES = 40 * 1024 * 1024;
export const MAX_POST_VIDEO_SECONDS = 60;
export const MAX_STORY_VIDEO_SECONDS = 15;

export interface VideoMeta {
  duration: number;
  width: number;
  height: number;
}

const VIDEO_EXTENSIONS = new Set(["mp4", "mov", "m4v", "webm", "ogv"]);

export function isImageFile(file: File): boolean {
  return (
    file.type.startsWith("image/") ||
    /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name)
  );
}

export function isVideoFile(file: File): boolean {
  if (file.type.startsWith("video/")) return true;
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return VIDEO_EXTENSIONS.has(extension);
}

export function readVideoMeta(file: File): Promise<VideoMeta> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    let settled = false;
    let timer: number | null = null;

    const cleanup = () => {
      if (timer !== null) window.clearTimeout(timer);
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
    };

    const finish = (meta: VideoMeta) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(meta);
    };

    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(message));
    };

    const read = () => {
      if (!Number.isFinite(video.duration) || video.duration <= 0) return false;
      finish({
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
      });
      return true;
    };

    timer = window.setTimeout(
      () => fail("Could not read this video. Try an MP4 file."),
      12000,
    );

    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;

    video.onloadedmetadata = () => {
      if (read()) return;
      // iOS ba'zi fayllarda duration'ni metadata bosqichida bermaydi.
      try {
        video.currentTime = 1e6;
      } catch {
        fail("Could not read this video. Try an MP4 file.");
      }
    };
    video.ondurationchange = () => {
      read();
    };
    video.ontimeupdate = () => {
      read();
    };
    video.onerror = () => fail("This video format is not supported. Try MP4.");

    video.src = url;
  });
}

export async function validateVideo(file: File, maxSeconds: number): Promise<VideoMeta> {
  if (!isVideoFile(file)) {
    throw new Error("Choose a video file (MP4, MOV or WebM).");
  }
  if (file.size > MAX_VIDEO_BYTES) {
    throw new Error("Video is larger than 40 MB.");
  }

  const meta = await readVideoMeta(file);
  if (!Number.isFinite(meta.duration) || meta.duration <= 0) {
    throw new Error("Could not read this video. Try an MP4 file.");
  }
  if (meta.duration > maxSeconds + 0.25) {
    throw new Error(`Video must be ${maxSeconds} seconds or shorter.`);
  }

  return meta;
}

export function videoExtension(file: File): string {
  const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
  if (extension && VIDEO_EXTENSIONS.has(extension)) return extension;
  if (file.type === "video/quicktime") return "mov";
  if (file.type === "video/webm") return "webm";
  return "mp4";
}

export function videoContentType(file: File): string {
  if (file.type.startsWith("video/")) return file.type;
  if (videoExtension(file) === "mov") return "video/quicktime";
  if (videoExtension(file) === "webm") return "video/webm";
  return "video/mp4";
}
