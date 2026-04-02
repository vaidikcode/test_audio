import { Navigate, NavLink, Route, Routes } from "react-router-dom";
import { ComparePage } from "./pages/ComparePage";
import { MireloPage } from "./pages/MireloPage";

const linkClass = ({ isActive }: { isActive: boolean }) =>
  [
    "border px-3 py-1.5 font-mono-ui text-xs font-medium transition-colors no-underline",
    isActive
      ? "border-neutral-900 bg-neutral-900 text-white"
      : "border-neutral-300 text-neutral-600 hover:border-neutral-900 hover:text-neutral-900",
  ].join(" ");

export default function App() {
  return (
    <div className="min-h-screen bg-white">
      <nav className="sticky top-0 z-10 border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-3 px-3 py-2">
          <span className="font-mono-ui text-xs font-semibold uppercase tracking-widest text-neutral-900">
            Music compare
          </span>
          <div className="flex gap-1">
            <NavLink to="/" end className={linkClass}>
              Compare
            </NavLink>
            <NavLink to="/mirelo" className={linkClass}>
              Mirelo
            </NavLink>
          </div>
        </div>
      </nav>
      <main className="mx-auto max-w-[1400px]">
        <Routes>
          <Route path="/" element={<ComparePage />} />
          <Route path="/mirelo" element={<MireloPage />} />
          <Route path="/elevenlabs" element={<Navigate to="/mirelo" replace />} />
        </Routes>
      </main>
    </div>
  );
}
