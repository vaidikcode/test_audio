/** Pick a sensible Content-Type when the browser leaves `File.type` empty (common for .wav on Windows). */
export function inferAudioContentType(file: File): string | undefined {
  const name = file.name.toLowerCase();
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";

  const byExt: Record<string, string> = {
    ".wav": "audio/wav",
    ".wave": "audio/wav",
    ".x-wav": "audio/wav",
    ".mp3": "audio/mpeg",
    ".flac": "audio/flac",
    ".ogg": "audio/ogg",
    ".oga": "audio/ogg",
    ".opus": "audio/opus",
    ".m4a": "audio/mp4",
    ".aac": "audio/aac",
    ".webm": "audio/webm",
    ".aiff": "audio/aiff",
    ".aif": "audio/aiff",
  };

  if (ext && byExt[ext]) return byExt[ext];

  const t = file.type?.trim();
  if (t && t !== "application/octet-stream") return t;

  return undefined;
}

export function extensionFromFilename(name: string): string {
  if (!name.includes(".")) return "";
  return name.slice(name.lastIndexOf(".")).toLowerCase();
}

/** Extension for storage path; falls back from MIME if filename has no extension. */
export function storageExtensionForFile(file: File): string {
  const fromName = extensionFromFilename(file.name);
  if (fromName) return fromName;

  const ct = inferAudioContentType(file) || file.type || "";
  if (ct.includes("wav")) return ".wav";
  if (ct.includes("mpeg") || ct.includes("mp3")) return ".mp3";
  if (ct.includes("flac")) return ".flac";
  if (ct.includes("ogg")) return ".ogg";
  if (ct.includes("mp4") || ct.includes("m4a")) return ".m4a";
  if (ct.includes("aac")) return ".aac";
  if (ct.includes("webm")) return ".webm";
  return "";
}

/** When fetch returns a Blob with an empty or generic type, infer from URL path. */
export function inferBlobAudioContentType(blob: Blob, urlHint?: string): string | undefined {
  const t = blob.type?.trim();
  if (t && t !== "application/octet-stream") return t;

  const u = (urlHint || "").toLowerCase();
  if (u.includes(".wav") || u.includes("wav?")) return "audio/wav";
  if (u.includes(".mp3") || u.includes("mpeg")) return "audio/mpeg";
  if (u.includes(".flac")) return "audio/flac";
  if (u.includes(".ogg")) return "audio/ogg";
  if (u.includes(".m4a")) return "audio/mp4";

  return t || undefined;
}
