import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchMireloHealth,
  mireloFetchResultBlob,
  mireloPreflight,
  mireloTextToMusicCreateJob,
  mireloTextToMusicPollJob,
  mireloTextToMusicSync,
} from "../api/mirelo";
import { inferBlobAudioContentType } from "../lib/audioUpload";
import { BUCKET, type DbPrompt, supabase, supabaseConfigured } from "../lib/supabase";
import type { JobPollResponse } from "../types/mirelo";

const DEFAULT_DURATION = 30_000;
const DEFAULT_SAMPLES = 1;
const DEFAULT_LIBRARY_PROVIDER = "ElevenLabs";

function extensionForAudio(blob: Blob, url: string): string {
  const t = (blob.type || "").toLowerCase();
  if (t.includes("wav")) return ".wav";
  if (t.includes("ogg")) return ".ogg";
  if (t.includes("flac")) return ".flac";
  if (t.includes("mpeg") || t.includes("mp3")) return ".mp3";
  const u = url.toLowerCase();
  if (u.includes(".wav") || u.includes("wave")) return ".wav";
  if (u.includes(".mp3")) return ".mp3";
  if (u.includes(".flac")) return ".flac";
  return ".mp3";
}

export function MireloPage() {
  const [health, setHealth] = useState<{ ok: boolean; mireloKeyConfigured: boolean } | null>(
    null,
  );
  const [prompt, setPrompt] = useState("calm piano ambient");
  const [durationMs, setDurationMs] = useState(DEFAULT_DURATION);
  const [numSamples, setNumSamples] = useState(DEFAULT_SAMPLES);
  const [useSync, setUseSync] = useState(false);

  const [preflight, setPreflight] = useState<{ credits: number; estimated_ms: number } | null>(
    null,
  );
  const [resultUrls, setResultUrls] = useState<string[]>([]);
  const [poll, setPoll] = useState<JobPollResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [prompts, setPrompts] = useState<DbPrompt[]>([]);
  const [useGenerationPromptForLibrary, setUseGenerationPromptForLibrary] = useState(true);
  const [libraryPromptText, setLibraryPromptText] = useState("");
  const [libraryProviderName, setLibraryProviderName] = useState(DEFAULT_LIBRARY_PROVIDER);
  const [libraryMsg, setLibraryMsg] = useState<string | null>(null);
  /** null = idle, -1 = saving all, else saving that sample index */
  const [savingIndex, setSavingIndex] = useState<number | null>(null);
  const [downloadingIndex, setDownloadingIndex] = useState<number | null>(null);

  const loadPrompts = useCallback(async () => {
    if (!supabase) return;
    const { data, error: e } = await supabase
      .from("prompts")
      .select("*")
      .order("created_at", { ascending: false });
    if (e) return;
    setPrompts((data as DbPrompt[]) ?? []);
  }, []);

  useEffect(() => {
    void fetchMireloHealth().then(setHealth).catch(() => setHealth(null));
  }, []);

  useEffect(() => {
    void loadPrompts();
  }, [loadPrompts]);

  const resolveLibraryPromptKey = (): string => {
    if (useGenerationPromptForLibrary) return prompt.trim();
    return libraryPromptText.trim();
  };

  const ensurePromptRow = async (promptText: string) => {
    if (!supabase) throw new Error("Supabase not configured");
    const { data: row } = await supabase
      .from("prompts")
      .select("prompt_text")
      .eq("prompt_text", promptText)
      .maybeSingle();
    if (row) return;
    const { error: insErr } = await supabase.from("prompts").insert({ prompt_text: promptText });
    if (insErr) throw new Error(insErr.message);
    await loadPrompts();
  };

  const ensureProviderRow = async (promptText: string, name: string): Promise<string> => {
    if (!supabase) throw new Error("Supabase not configured");
    const trimmed = name.trim() || DEFAULT_LIBRARY_PROVIDER;
    const { data: found } = await supabase
      .from("providers")
      .select("id")
      .eq("prompt_text", promptText)
      .eq("name", trimmed)
      .maybeSingle();
    if (found && typeof (found as { id: string }).id === "string") {
      return (found as { id: string }).id;
    }
    const { data: created, error: insErr } = await supabase
      .from("providers")
      .insert({ prompt_text: promptText, name: trimmed })
      .select("id")
      .single();
    if (insErr) throw new Error(insErr.message);
    return (created as { id: string }).id;
  };

  const downloadSample = async (url: string, index: number) => {
    setLibraryMsg(null);
    setError(null);
    setDownloadingIndex(index);
    try {
      const blob = await mireloFetchResultBlob(url);
      const ext = extensionForAudio(blob, url);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `mirelo-sample-${index + 1}${ext}`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDownloadingIndex(null);
    }
  };

  const addSampleToLibrary = async (url: string, index: number) => {
    if (!supabase) {
      setLibraryMsg("Configure Supabase in client/.env to save samples.");
      return;
    }
    const promptKey = resolveLibraryPromptKey();
    if (!promptKey) {
      setLibraryMsg("Choose or enter a compare prompt first.");
      return;
    }

    setLibraryMsg(null);
    setError(null);
    setSavingIndex(index);
    try {
      await ensurePromptRow(promptKey);
      const providerId = await ensureProviderRow(promptKey, libraryProviderName);
      const blob = await mireloFetchResultBlob(url);
      const ext = extensionForAudio(blob, url);
      const path = `${providerId}/${crypto.randomUUID()}${ext}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, blob, {
        upsert: false,
        contentType: inferBlobAudioContentType(blob, url) || undefined,
      });
      if (upErr) throw new Error(upErr.message);
      const label = `Mirelo gen #${index + 1}`;
      const { error: rowErr } = await supabase.from("audio_samples").insert({
        provider_id: providerId,
        label,
        storage_path: path,
      });
      if (rowErr) throw new Error(rowErr.message);
      setLibraryMsg(`Saved sample ${index + 1} under “${libraryProviderName.trim() || DEFAULT_LIBRARY_PROVIDER}”.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingIndex(null);
    }
  };

  const addAllToLibrary = async () => {
    if (!supabase) {
      setLibraryMsg("Configure Supabase in client/.env to save samples.");
      return;
    }
    const promptKey = resolveLibraryPromptKey();
    if (!promptKey) {
      setLibraryMsg("Choose or enter a compare prompt first.");
      return;
    }
    setLibraryMsg(null);
    setError(null);
    setSavingIndex(-1);
    try {
      await ensurePromptRow(promptKey);
      const providerId = await ensureProviderRow(promptKey, libraryProviderName);
      for (let i = 0; i < resultUrls.length; i++) {
        const url = resultUrls[i];
        const blob = await mireloFetchResultBlob(url);
        const ext = extensionForAudio(blob, url);
        const path = `${providerId}/${crypto.randomUUID()}${ext}`;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, blob, {
          upsert: false,
          contentType: inferBlobAudioContentType(blob, url) || undefined,
        });
        if (upErr) throw new Error(upErr.message);
        const label = `Mirelo gen #${i + 1}`;
        const { error: rowErr } = await supabase.from("audio_samples").insert({
          provider_id: providerId,
          label,
          storage_path: path,
        });
        if (rowErr) throw new Error(rowErr.message);
      }
      setLibraryMsg(
        `Saved ${resultUrls.length} sample(s) under “${libraryProviderName.trim() || DEFAULT_LIBRARY_PROVIDER}”.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingIndex(null);
    }
  };

  const runPreflight = async () => {
    setError(null);
    setBusy(true);
    try {
      const p = await mireloPreflight(durationMs, numSamples);
      setPreflight(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const runGenerate = async () => {
    setError(null);
    setResultUrls([]);
    setPoll(null);
    setLibraryMsg(null);
    setBusy(true);
    try {
      if (useSync) {
        const res = await mireloTextToMusicSync({
          prompt,
          duration_ms: durationMs,
          num_samples: numSamples,
        });
        setResultUrls(res.result_urls);
      } else {
        const created = await mireloTextToMusicCreateJob({
          prompt,
          duration_ms: durationMs,
          num_samples: numSamples,
        });
        setPoll({
          job_id: created.job_id,
          status: "processing",
          created_at: new Date().toISOString(),
          estimated_completion_at: created.estimated_completion_at,
          estimated_ms: created.estimated_ms,
          progress_percent: 0,
          request: { prompt, duration_ms: durationMs, num_samples: numSamples },
        });
        for (;;) {
          const job = await mireloTextToMusicPollJob(created.job_id);
          setPoll(job);
          if (job.status === "succeeded") {
            setResultUrls(job.result.result_urls);
            break;
          }
          if (job.status === "errored") {
            throw new Error(job.error?.message || job.error?.code || "Job failed");
          }
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 p-3 pb-16">
      <header className="border-b border-neutral-200 pb-3">
        <h1 className="font-mono-ui text-sm font-semibold uppercase tracking-[0.2em] text-neutral-900">
          Mirelo
        </h1>
        <p className="mt-1 text-[11px] leading-snug text-neutral-600">
          Proxy <code className="rounded bg-neutral-100 px-1 text-neutral-800">/api/mirelo/…</code> · key
          stays on server.
        </p>
        {health && (
          <p className="mt-2 font-mono-ui text-[10px] text-neutral-500">
            health {health.ok ? "ok" : "down"} · key {health.mireloKeyConfigured ? "set" : "missing"}
          </p>
        )}
      </header>

      {error && <div className="ui-error font-mono-ui">{error}</div>}

      <section className="bw-panel overflow-hidden">
        <div className="border-b border-neutral-200 bg-neutral-50 px-2 py-1.5 font-mono-ui text-[10px] font-medium uppercase tracking-wider text-neutral-600">
          Generate
        </div>
        <table className="bw-table">
          <tbody>
            <tr>
              <th className="w-28 font-mono-ui normal-case text-neutral-500">Prompt</th>
              <td>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={3}
                  className="bw-input font-mono-ui"
                />
              </td>
            </tr>
            <tr>
              <th className="font-mono-ui normal-case text-neutral-500">Duration ms</th>
              <td>
                <input
                  type="number"
                  min={3000}
                  max={600_000}
                  value={durationMs}
                  onChange={(e) => setDurationMs(Number(e.target.value))}
                  className="bw-input max-w-[140px] font-mono-ui"
                />
              </td>
            </tr>
            <tr>
              <th className="font-mono-ui normal-case text-neutral-500">Samples</th>
              <td>
                <input
                  type="number"
                  min={1}
                  max={4}
                  value={numSamples}
                  onChange={(e) => setNumSamples(Number(e.target.value))}
                  className="bw-input max-w-[100px] font-mono-ui"
                />
              </td>
            </tr>
            <tr>
              <th className="font-mono-ui normal-case text-neutral-500">Sync</th>
              <td>
                <label className="flex cursor-pointer items-center gap-2 text-xs text-neutral-600">
                  <input
                    type="checkbox"
                    checked={useSync}
                    onChange={(e) => setUseSync(e.target.checked)}
                    className="border-neutral-400 bg-white"
                  />
                  synchronous endpoint
                </label>
              </td>
            </tr>
            <tr>
              <th className="font-mono-ui normal-case text-neutral-500">Actions</th>
              <td className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void runPreflight()}
                  disabled={busy}
                  className="bw-btn-ghost"
                >
                  Preflight
                </button>
                <button
                  type="button"
                  onClick={() => void runGenerate()}
                  disabled={busy || !prompt.trim()}
                  className="bw-btn"
                >
                  {busy ? "…" : useSync ? "Sync" : "Job"}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        {preflight && (
          <div className="border-t border-neutral-200 bg-neutral-50 px-2 py-2 font-mono-ui text-[10px] text-neutral-600">
            preflight credits ~{preflight.credits} · est_ms ~{preflight.estimated_ms}
          </div>
        )}
        {poll && poll.status === "processing" && (
          <div className="border-t border-neutral-200 bg-neutral-50 px-2 py-2 font-mono-ui text-[10px] text-neutral-600">
            job {poll.job_id} · {poll.progress_percent ?? 0}%
          </div>
        )}
      </section>

      {resultUrls.length > 0 && (
        <section className="bw-panel overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 bg-neutral-50 px-2 py-1.5">
            <span className="font-mono-ui text-[10px] font-medium uppercase tracking-wider text-neutral-600">
              Results
            </span>
            <Link to="/" className="font-mono-ui text-[10px] text-neutral-700">
              Compare →
            </Link>
          </div>

          {supabaseConfigured ? (
            <div className="border-b border-neutral-200 p-2">
              <table className="bw-table">
                <tbody>
                  <tr>
                    <th className="w-40 font-mono-ui normal-case text-neutral-500">Library</th>
                    <td className="text-[11px] text-neutral-600">
                      Save via proxy to Supabase. Default provider{" "}
                      <code className="rounded bg-neutral-100 px-1 text-neutral-800">
                        {DEFAULT_LIBRARY_PROVIDER}
                      </code>
                      .
                    </td>
                  </tr>
                  <tr>
                    <th className="font-mono-ui normal-case text-neutral-500">Gen → prompt</th>
                    <td>
                      <label className="flex cursor-pointer items-center gap-2 text-xs text-neutral-600">
                        <input
                          type="checkbox"
                          checked={useGenerationPromptForLibrary}
                          onChange={(e) => setUseGenerationPromptForLibrary(e.target.checked)}
                          className="border-neutral-400 bg-white"
                        />
                        use generation prompt as Compare key
                      </label>
                    </td>
                  </tr>
                  {!useGenerationPromptForLibrary && (
                    <tr>
                      <th className="font-mono-ui normal-case text-neutral-500">Compare prompt</th>
                      <td>
                        <select
                          value={libraryPromptText}
                          onChange={(e) => setLibraryPromptText(e.target.value)}
                          className="bw-input max-w-full font-mono-ui"
                        >
                          <option value="">—</option>
                          {prompts.map((p) => (
                            <option key={p.prompt_text} value={p.prompt_text}>
                              {p.prompt_text.length > 64 ? `${p.prompt_text.slice(0, 64)}…` : p.prompt_text}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  )}
                  <tr>
                    <th className="font-mono-ui normal-case text-neutral-500">Provider</th>
                    <td>
                      <input
                        value={libraryProviderName}
                        onChange={(e) => setLibraryProviderName(e.target.value)}
                        placeholder={DEFAULT_LIBRARY_PROVIDER}
                        className="bw-input max-w-xs font-mono-ui"
                      />
                    </td>
                  </tr>
                  {libraryMsg && (
                    <tr>
                      <td colSpan={2} className="font-mono-ui text-[11px] text-neutral-700">
                        {libraryMsg}
                      </td>
                    </tr>
                  )}
                  {resultUrls.length > 1 && (
                    <tr>
                      <td colSpan={2}>
                        <button
                          type="button"
                          onClick={() => void addAllToLibrary()}
                          disabled={savingIndex !== null || downloadingIndex !== null}
                          className="bw-btn-ghost"
                        >
                          {savingIndex === -1 ? "Saving…" : "Add all"}
                        </button>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="border-b border-neutral-200 p-2 text-[11px] text-neutral-600">
              Set VITE_SUPABASE_* for save-to-Compare.
            </p>
          )}

          <div className="overflow-x-auto">
            <table className="bw-table">
              <thead>
                <tr>
                  <th className="w-10">#</th>
                  <th>Preview</th>
                  <th className="w-48">Actions</th>
                </tr>
              </thead>
              <tbody>
                {resultUrls.map((url, i) => (
                  <tr key={url}>
                    <td className="font-mono-ui text-neutral-600">{i + 1}</td>
                    <td>
                      <audio controls src={url} className="h-9 w-full max-w-md" />
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          onClick={() => void downloadSample(url, i)}
                          disabled={downloadingIndex === i || savingIndex !== null}
                          className="bw-btn text-[10px]"
                        >
                          {downloadingIndex === i ? "…" : "DL"}
                        </button>
                        {supabaseConfigured && (
                          <button
                            type="button"
                            onClick={() => void addSampleToLibrary(url, i)}
                            disabled={
                              savingIndex === -1 || savingIndex === i || downloadingIndex === i
                            }
                            className="bw-btn-ghost text-[10px]"
                          >
                            {savingIndex === i ? "…" : "Save"}
                          </button>
                        )}
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono-ui text-[10px] text-neutral-600"
                        >
                          url
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
