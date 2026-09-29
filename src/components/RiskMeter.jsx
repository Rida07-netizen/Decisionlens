// RiskMeter is DecisionLens's signature visual: a segmented bar read
// left-to-right as "how much attention this student needs" — the
// opposite polarity of a confidence meter, so high values are coral
// (urgent) rather than teal (good). Reused on Dashboard, My Students,
// and Student Detail so risk always looks and reads the same way.

const bandFor = (value) => {
  if (value >= 70) return { key: "high", label: "High risk", color: "var(--dl-coral)", soft: "var(--dl-coral-soft)" };
  if (value >= 40) return { key: "moderate", label: "Moderate risk", color: "var(--dl-amber)", soft: "var(--dl-amber-soft)" };
  return { key: "low", label: "Low risk", color: "var(--dl-teal)", soft: "var(--dl-teal-soft)" };
};

export default function RiskMeter({ value, size = "md", showLabel = true }) {
  const band = bandFor(value);
  const segments = 20;
  const filled = Math.round((value / 100) * segments);
  const height = size === "sm" ? "h-1.5" : "h-2.5";

  return (
    <div className="w-full">
      {showLabel && (
        <div className="flex items-baseline justify-between mb-1.5">
          <span className="text-xs uppercase tracking-wide" style={{ color: "var(--dl-slate)" }}>
            {band.label}
          </span>
          <span className="font-mono-num text-sm font-semibold" style={{ color: band.color }}>
            {value}
          </span>
        </div>
      )}
      <div className={`flex gap-[3px] ${height}`}>
        {Array.from({ length: segments }).map((_, i) => (
          <div
            key={i}
            className="flex-1 rounded-[1px] transition-colors"
            style={{
              background: i < filled ? band.color : "var(--dl-line)",
            }}
          />
        ))}
      </div>
    </div>
  );
}

export { bandFor };
