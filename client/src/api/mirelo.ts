import type {
  AsyncJobCreatedResponse,
  JobPollResponse,
  PreflightResponse,
  SyncSuccessResponse,
} from "../types/mirelo";

const BASE = "/api/mirelo/text-to-music";

function mireloErrorMessage(data: unknown): string {
  if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    const err = o.error;
    if (err && typeof err === "object") {
      const e = err as Record<string, unknown>;
      if (typeof e.message === "string") return e.message;
      if (typeof e.code === "string") return e.code;
    }
    if (typeof o.error === "string") return o.error;
    if (typeof o.message === "string") return o.message;
  }
  try {
    return JSON.stringify(data);
  } catch {
    return String(data);
  }
}

async function parseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export async function mireloPreflight(
  durationMs: number,
  numSamples: number,
): Promise<PreflightResponse> {
  const q = new URLSearchParams({
    duration_ms: String(durationMs),
    num_samples: String(numSamples),
  });
  const res = await fetch(`${BASE}/preflight?${q}`);
  const data = await parseJson(res);
  if (!res.ok) throw new Error(mireloErrorMessage(data));
  return data as PreflightResponse;
}

export async function mireloTextToMusicSync(body: {
  prompt: string;
  duration_ms: number;
  num_samples?: number;
}): Promise<SyncSuccessResponse> {
  const res = await fetch(`${BASE}/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await parseJson(res);
  if (!res.ok) throw new Error(mireloErrorMessage(data));
  return data as SyncSuccessResponse;
}

export async function mireloTextToMusicCreateJob(body: {
  prompt: string;
  duration_ms: number;
  num_samples?: number;
}): Promise<AsyncJobCreatedResponse> {
  const res = await fetch(`${BASE}/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await parseJson(res);
  if (!res.ok) throw new Error(mireloErrorMessage(data));
  return data as AsyncJobCreatedResponse;
}

export async function mireloTextToMusicPollJob(jobId: string): Promise<JobPollResponse> {
  const res = await fetch(`${BASE}/jobs/${encodeURIComponent(jobId)}`);
  const data = await parseJson(res);
  if (!res.ok) throw new Error(mireloErrorMessage(data));
  return data as JobPollResponse;
}

export async function pollMireloJobUntilDone(
  jobId: string,
  onTick?: (p: JobPollResponse) => void,
): Promise<SyncSuccessResponse> {
  for (;;) {
    const poll = await mireloTextToMusicPollJob(jobId);
    onTick?.(poll);
    if (poll.status === "succeeded") return poll.result;
    if (poll.status === "errored") {
      const msg = poll.error?.message || poll.error?.code || "Job failed";
      throw new Error(msg);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}

/** Fetch a Mirelo result URL through the dev proxy (same-origin, no CORS). */
export async function mireloFetchResultBlob(url: string): Promise<Blob> {
  const res = await fetch("/api/mirelo/fetch-result-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = (await res.json()) as { error?: string; detail?: string };
      msg = [j.error, j.detail].filter(Boolean).join(" — ") || msg;
    } catch {
      try {
        msg = await res.text();
      } catch {
        /* keep msg */
      }
    }
    throw new Error(msg || `HTTP ${res.status}`);
  }
  return res.blob();
}

export async function fetchMireloHealth(): Promise<{
  ok: boolean;
  mireloKeyConfigured: boolean;
}> {
  const res = await fetch("/api/health");
  const data = (await parseJson(res)) as {
    ok?: boolean;
    mireloKeyConfigured?: boolean;
  };
  return {
    ok: Boolean(data?.ok),
    mireloKeyConfigured: Boolean(data?.mireloKeyConfigured),
  };
}
