import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { SamplePlayer } from "../components/SamplePlayer";
import { inferAudioContentType, storageExtensionForFile } from "../lib/audioUpload";
import {
  BUCKET,
  type DbAudioSample,
  type DbPrompt,
  type DbProvider,
  supabase,
  supabaseConfigured,
} from "../lib/supabase";

function publicUrl(path: string): string {
  if (!supabase) return "";
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export function ComparePage() {
  const [prompts, setPrompts] = useState<DbPrompt[]>([]);
  const [selectedPrompt, setSelectedPrompt] = useState<string | null>(null);
  const [providers, setProviders] = useState<DbProvider[]>([]);
  const [samples, setSamples] = useState<DbAudioSample[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [newPromptText, setNewPromptText] = useState("");
  const [newProviderName, setNewProviderName] = useState("");
  const [uploadProviderId, setUploadProviderId] = useState<string>("");
  const [uploadLabel, setUploadLabel] = useState("");

  const samplesByProvider = useMemo(() => {
    const m = new Map<string, DbAudioSample[]>();
    for (const s of samples) {
      const list = m.get(s.provider_id) ?? [];
      list.push(s);
      m.set(s.provider_id, list);
    }
    for (const list of m.values()) {
      list.sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
    }
    return m;
  }, [samples]);

  const maxSampleRows = useMemo(() => {
    if (providers.length === 0) return 0;
    return Math.max(
      0,
      ...providers.map((p) => (samplesByProvider.get(p.id) ?? []).length),
    );
  }, [providers, samplesByProvider]);

  const loadPrompts = useCallback(async () => {
    if (!supabase) return;
    setError(null);
    const { data, error: e } = await supabase
      .from("prompts")
      .select("*")
      .order("created_at", { ascending: false });
    if (e) {
      setError(e.message);
      return;
    }
    setPrompts((data as DbPrompt[]) ?? []);
  }, []);

  const loadForPrompt = useCallback(async (promptText: string) => {
    if (!supabase) return;
    setError(null);
    const { data: provs, error: pe } = await supabase
      .from("providers")
      .select("*")
      .eq("prompt_text", promptText)
      .order("created_at", { ascending: true });
    if (pe) {
      setError(pe.message);
      return;
    }
    const plist = (provs as DbProvider[]) ?? [];
    setProviders(plist);
    setUploadProviderId((prev) =>
      plist.some((p) => p.id === prev) ? prev : (plist[0]?.id ?? ""),
    );
    const ids = plist.map((p) => p.id);
    if (ids.length === 0) {
      setSamples([]);
      return;
    }
    const { data: samp, error: se } = await supabase
      .from("audio_samples")
      .select("*")
      .in("provider_id", ids)
      .order("created_at", { ascending: true });
    if (se) {
      setError(se.message);
      return;
    }
    setSamples((samp as DbAudioSample[]) ?? []);
  }, []);

  useEffect(() => {
    void loadPrompts();
  }, [loadPrompts]);

  useLayoutEffect(() => {
    if (prompts.length === 0) {
      setSelectedPrompt(null);
      return;
    }
    if (!selectedPrompt || !prompts.some((p) => p.prompt_text === selectedPrompt)) {
      setSelectedPrompt(prompts[0].prompt_text);
    }
  }, [prompts, selectedPrompt]);

  useEffect(() => {
    if (selectedPrompt) void loadForPrompt(selectedPrompt);
  }, [selectedPrompt, loadForPrompt]);

  const addPrompt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !newPromptText.trim()) return;
    setBusy(true);
    setError(null);
    const text = newPromptText.trim();
    const { error: insErr } = await supabase.from("prompts").insert({ prompt_text: text });
    setBusy(false);
    if (insErr) {
      setError(insErr.message);
      return;
    }
    setNewPromptText("");
    await loadPrompts();
    setSelectedPrompt(text);
  };

  const addProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !selectedPrompt || !newProviderName.trim()) return;
    setBusy(true);
    setError(null);
    const { error: insErr } = await supabase.from("providers").insert({
      prompt_text: selectedPrompt,
      name: newProviderName.trim(),
    });
    setBusy(false);
    if (insErr) {
      setError(insErr.message);
      return;
    }
    setNewProviderName("");
    await loadForPrompt(selectedPrompt);
  };

  const uploadSample = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !uploadProviderId) return;
    const input = (e.target as HTMLFormElement).elements.namedItem(
      "file",
    ) as HTMLInputElement;
    const file = input?.files?.[0];
    if (!file) {
      setError("Choose an audio file.");
      return;
    }
    setBusy(true);
    setError(null);
    const ext = storageExtensionForFile(file) || ".bin";
    const path = `${uploadProviderId}/${crypto.randomUUID()}${ext}`;
    const contentType = inferAudioContentType(file) || file.type || undefined;
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
      upsert: false,
      contentType,
    });
    if (upErr) {
      setBusy(false);
      setError(upErr.message);
      return;
    }
    const { error: rowErr } = await supabase.from("audio_samples").insert({
      provider_id: uploadProviderId,
      label: uploadLabel.trim() || file.name,
      storage_path: path,
    });
    setBusy(false);
    if (rowErr) {
      setError(rowErr.message);
      return;
    }
    setUploadLabel("");
    input.value = "";
    if (selectedPrompt) await loadForPrompt(selectedPrompt);
  };

  const removeSample = async (s: DbAudioSample) => {
    if (!supabase || !selectedPrompt) return;
    setBusy(true);
    setError(null);
    await supabase.storage.from(BUCKET).remove([s.storage_path]);
    const { error: delErr } = await supabase.from("audio_samples").delete().eq("id", s.id);
    setBusy(false);
    if (delErr) {
      setError(delErr.message);
      return;
    }
    await loadForPrompt(selectedPrompt);
  };

  const removeProvider = async (p: DbProvider) => {
    if (!supabase || !selectedPrompt) return;
    setBusy(true);
    setError(null);
    const { data: rows } = await supabase
      .from("audio_samples")
      .select("storage_path")
      .eq("provider_id", p.id);
    const paths = (rows as { storage_path: string }[] | null)?.map((r) => r.storage_path) ?? [];
    if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
    const { error: delErr } = await supabase.from("providers").delete().eq("id", p.id);
    setBusy(false);
    if (delErr) {
      setError(delErr.message);
      return;
    }
    await loadForPrompt(selectedPrompt);
  };

  const deletePromptByKey = async (promptKey: string) => {
    if (!supabase || !promptKey) return;
    if (!confirm(`Delete prompt and all providers/samples?\n\n${promptKey}`)) return;
    setBusy(true);
    setError(null);
    const { data: provs } = await supabase.from("providers").select("id").eq("prompt_text", promptKey);
    const ids = (provs as { id: string }[] | null)?.map((x) => x.id) ?? [];
    for (const id of ids) {
      const { data: rows } = await supabase
        .from("audio_samples")
        .select("storage_path")
        .eq("provider_id", id);
      const paths =
        (rows as { storage_path: string }[] | null)?.map((r) => r.storage_path) ?? [];
      if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
    }
    const { error: delErr } = await supabase.from("prompts").delete().eq("prompt_text", promptKey);
    setBusy(false);
    if (delErr) {
      setError(delErr.message);
      return;
    }
    if (selectedPrompt === promptKey) {
      setSelectedPrompt(null);
      setProviders([]);
      setSamples([]);
    }
    await loadPrompts();
  };

  if (!supabaseConfigured) {
    return (
      <div className="bw-panel mx-auto max-w-lg p-4">
        <h1 className="font-mono-ui text-sm font-semibold uppercase tracking-widest text-neutral-900">
          Compare
        </h1>
        <p className="mt-3 text-xs leading-relaxed text-neutral-600">
          Set <code className="rounded bg-neutral-100 px-1 text-neutral-800">VITE_SUPABASE_URL</code>{" "}
          and{" "}
          <code className="rounded bg-neutral-100 px-1 text-neutral-800">VITE_SUPABASE_ANON_KEY</code>{" "}
          in <code className="rounded bg-neutral-100 px-1 text-neutral-800">client/.env</code>. Run{" "}
          <code className="rounded bg-neutral-100 px-1 text-neutral-800">supabase/schema.sql</code>{" "}
          and bucket{" "}
          <code className="rounded bg-neutral-100 px-1 text-neutral-800">music-samples</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-3 pb-16">
      <header className="flex flex-wrap items-end justify-between gap-2 border-b border-neutral-200 pb-3">
        <div>
          <h1 className="font-mono-ui text-sm font-semibold uppercase tracking-[0.2em] text-neutral-900">
            Compare
          </h1>
          <p className="mt-1 max-w-xl text-[11px] leading-snug text-neutral-500">
            Prompts as rows; matrix aligns sample index across providers.
          </p>
        </div>
      </header>

      {error && <div className="ui-error font-mono-ui">{error}</div>}

      <section className="bw-panel overflow-hidden">
        <div className="border-b border-neutral-200 bg-neutral-50 px-2 py-1.5 font-mono-ui text-[10px] font-medium uppercase tracking-wider text-neutral-600">
          Prompts
        </div>
        <div className="overflow-x-auto">
          <table className="bw-table">
            <thead>
              <tr>
                <th className="w-8"> </th>
                <th>Prompt key</th>
                <th className="w-20 text-right">Del</th>
              </tr>
            </thead>
            <tbody>
              {prompts.length === 0 ? (
                <tr>
                  <td colSpan={3} className="text-neutral-600">
                    No prompts.
                  </td>
                </tr>
              ) : (
                prompts.map((p) => {
                  const active = selectedPrompt === p.prompt_text;
                  return (
                    <tr
                      key={p.prompt_text}
                      onClick={() => setSelectedPrompt(p.prompt_text)}
                      className={active ? "bg-neutral-100" : "cursor-pointer"}
                    >
                      <td className="font-mono-ui text-neutral-500">{active ? "●" : "○"}</td>
                      <td className="max-w-[min(720px,70vw)]">
                        <span className="font-mono-ui text-[11px] leading-snug text-neutral-800">
                          {p.prompt_text}
                        </span>
                      </td>
                      <td className="text-right">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={(e) => {
                            e.stopPropagation();
                            void deletePromptByKey(p.prompt_text);
                          }}
                          className="bw-btn-danger"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} className="bg-neutral-50">
                  <form onSubmit={addPrompt} className="flex flex-wrap items-center gap-2 py-2">
                    <input
                      value={newPromptText}
                      onChange={(e) => setNewPromptText(e.target.value)}
                      placeholder="New prompt (primary key)…"
                      className="bw-input min-w-[200px] flex-1"
                    />
                    <button type="submit" disabled={busy || !newPromptText.trim()} className="bw-btn">
                      Add
                    </button>
                  </form>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {selectedPrompt && (
        <>
          <section className="bw-panel overflow-hidden">
            <div className="border-b border-neutral-200 bg-neutral-50 px-2 py-1.5 font-mono-ui text-[10px] font-medium uppercase tracking-wider text-neutral-600">
              Active prompt
            </div>
            <div className="p-2">
              <p className="font-mono-ui text-xs leading-relaxed text-neutral-800">{selectedPrompt}</p>
            </div>
          </section>

          <section className="bw-panel overflow-hidden">
            <div className="border-b border-neutral-200 bg-neutral-50 px-2 py-1.5 font-mono-ui text-[10px] font-medium uppercase tracking-wider text-neutral-600">
              Operations
            </div>
            <table className="bw-table">
              <tbody>
                <tr>
                  <th className="w-32 font-mono-ui normal-case text-neutral-500">Add provider</th>
                  <td>
                    <form onSubmit={addProvider} className="flex flex-wrap items-center gap-2">
                      <input
                        value={newProviderName}
                        onChange={(e) => setNewProviderName(e.target.value)}
                        placeholder="Name"
                        className="bw-input max-w-xs flex-1"
                      />
                      <button
                        type="submit"
                        disabled={busy || !newProviderName.trim()}
                        className="bw-btn"
                      >
                        Add
                      </button>
                    </form>
                  </td>
                </tr>
                <tr>
                  <th className="font-mono-ui normal-case text-neutral-500">Upload</th>
                  <td>
                    <form onSubmit={uploadSample} className="flex flex-wrap items-end gap-2">
                      <select
                        value={uploadProviderId}
                        onChange={(e) => setUploadProviderId(e.target.value)}
                        className="bw-input w-auto max-w-[200px]"
                      >
                        {providers.length === 0 && <option value="">—</option>}
                        {providers.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                      <input
                        name="file"
                        type="file"
                        accept="audio/*,.wav,.wave,.mp3,.flac,.ogg,.m4a,.aac,.webm,.aif,.aiff,audio/wav,audio/x-wav"
                        className="max-w-[200px] text-[10px] text-neutral-600 file:mr-2 file:border file:border-neutral-300 file:bg-neutral-50 file:px-2 file:py-1 file:text-neutral-800"
                      />
                      <input
                        value={uploadLabel}
                        onChange={(e) => setUploadLabel(e.target.value)}
                        placeholder="Label"
                        className="bw-input max-w-[140px]"
                      />
                      <button type="submit" disabled={busy || !uploadProviderId} className="bw-btn">
                        Upload
                      </button>
                    </form>
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          <section className="bw-panel overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 bg-neutral-50 px-2 py-1.5">
              <span className="font-mono-ui text-[10px] font-medium uppercase tracking-wider text-neutral-600">
                Comparison matrix
              </span>
              {providers.length > 0 && maxSampleRows === 0 && (
                <span className="text-[10px] text-neutral-600">No samples yet</span>
              )}
            </div>
            {providers.length === 0 ? (
              <p className="p-3 text-xs text-neutral-600">Add a provider first.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="bw-table min-w-[480px]">
                  <thead>
                    <tr>
                      <th className="w-10">#</th>
                      {providers.map((p) => (
                        <th key={p.id}>
                          <div className="flex items-start justify-between gap-1">
                            <span className="text-neutral-900">{p.name}</span>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void removeProvider(p)}
                              className="shrink-0 text-[10px] text-neutral-500 hover:text-neutral-900"
                            >
                              ×
                            </button>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {maxSampleRows === 0 ? (
                      <tr>
                        <td colSpan={providers.length + 1} className="text-neutral-600">
                          —
                        </td>
                      </tr>
                    ) : (
                      Array.from({ length: maxSampleRows }, (_, rowIdx) => (
                        <tr key={rowIdx}>
                          <td className="font-mono-ui text-center text-neutral-600">{rowIdx + 1}</td>
                          {providers.map((p) => {
                            const list = samplesByProvider.get(p.id) ?? [];
                            const s = list[rowIdx];
                            return (
                              <td key={p.id} className="min-w-[140px]">
                                {s ? (
                                  <SamplePlayer
                                    compact
                                    src={publicUrl(s.storage_path)}
                                    label={s.label}
                                    onRemove={() => void removeSample(s)}
                                  />
                                ) : (
                                  <span className="font-mono-ui text-[10px] text-neutral-400">—</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
