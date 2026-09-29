import { Loader2, AlertCircle } from "lucide-react";

export function LoadingState({ label = "Loading…" }) {
  return (
    <div className="flex items-center gap-2 py-10 justify-center text-sm" style={{ color: "var(--dl-slate)" }}>
      <Loader2 size={16} className="animate-spin" />
      {label}
    </div>
  );
}

export function ErrorState({ message }) {
  return (
    <div
      className="flex items-start gap-2 p-4 rounded-lg text-sm"
      style={{ background: "var(--dl-coral-soft)", color: "var(--dl-coral)" }}
    >
      <AlertCircle size={16} className="shrink-0 mt-0.5" />
      <div>
        <p className="font-medium">Couldn't reach the API</p>
        <p className="text-xs mt-0.5" style={{ color: "var(--dl-ink-soft)" }}>
          {message || "Make sure the backend is running: npm run server"}
        </p>
      </div>
    </div>
  );
}
