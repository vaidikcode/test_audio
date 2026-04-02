import { useEffect, useRef, useState } from "react";

type Props = {
  src: string;
  label: string;
  onRemove?: () => void;
  /** Dense layout for comparison matrix cells */
  compact?: boolean;
};

export function SamplePlayer({ src, label, onRemove, compact }: Props) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    return () => {
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
    };
  }, []);

  const toggle = () => {
    const el = ref.current;
    if (!el) return;
    if (el.paused) void el.play();
    else el.pause();
  };

  if (compact) {
    return (
      <div className="border border-neutral-200 bg-neutral-50 p-2">
        <audio ref={ref} src={src} preload="metadata" className="hidden" />
        <p className="font-mono-ui line-clamp-2 text-[10px] leading-snug text-neutral-600">
          {label || "Sample"}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={toggle}
            className="border border-neutral-900 bg-neutral-900 px-2 py-0.5 font-mono-ui text-[10px] text-white hover:bg-neutral-800"
          >
            {playing ? "Pause" : "Play"}
          </button>
          <a
            href={src}
            target="_blank"
            rel="noreferrer"
            className="font-mono-ui text-[10px] text-neutral-600"
          >
            src
          </a>
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="font-mono-ui text-[10px] text-neutral-500 hover:text-neutral-900"
            >
              ×
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="border border-neutral-200 bg-white p-3 shadow-sm">
      <audio ref={ref} src={src} preload="metadata" className="hidden" />
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 text-sm font-medium text-neutral-900">{label || "Sample"}</p>
        {onRemove && (
          <button type="button" onClick={onRemove} className="bw-btn-danger shrink-0 text-[10px]">
            Remove
          </button>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" onClick={toggle} className="bw-btn">
          {playing ? "Pause" : "Play"}
        </button>
        <a href={src} target="_blank" rel="noreferrer" className="text-xs text-neutral-600">
          Open file
        </a>
      </div>
    </div>
  );
}
