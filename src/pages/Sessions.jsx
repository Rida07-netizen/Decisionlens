import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
} from "chart.js";
import { Layers } from "lucide-react";
import { LoadingState, ErrorState } from "../components/LoadingState";
import { getStudents } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { bandFor } from "../components/RiskMeter";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

export default function Sessions() {
  const { user } = useAuth();
  const [students, setStudents] = useState(null);
  const [error, setError] = useState(null);
  const [batch, setBatch] = useState("");

  useEffect(() => {
    getStudents(user.id)
      .then((data) => {
        setStudents(data);
        const batches = [...new Set(data.map((s) => s.batchYear))].sort().reverse();
        if (batches.length > 0) setBatch(batches[0]);
      })
      .catch((e) => setError(e.message));
  }, [user.id]);

  const batches = useMemo(
    () => (students ? [...new Set(students.map((s) => s.batchYear))].sort().reverse() : []),
    [students]
  );

  const batchStudents = useMemo(
    () => (students ? students.filter((s) => s.batchYear === batch) : []),
    [students, batch]
  );

  if (error) return <ErrorState message={error} />;
  if (!students) return <LoadingState label="Loading sessions…" />;

  const avgRisk = batchStudents.length
    ? Math.round(batchStudents.reduce((sum, s) => sum + s.riskScore, 0) / batchStudents.length)
    : 0;

  const chartData = {
    labels: batchStudents.map((s) => (s.name.length > 14 ? `${s.name.slice(0, 13)}…` : s.name)),
    datasets: [
      {
        label: "Risk score",
        data: batchStudents.map((s) => s.riskScore),
        backgroundColor: batchStudents.map((s) => bandFor(s.riskScore).color),
        borderRadius: 6,
        maxBarThickness: 44,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: (items) => batchStudents[items[0].dataIndex]?.name || "",
          label: (item) => `Risk score: ${item.formattedValue}`,
        },
      },
    },
    scales: {
      y: { beginAtZero: true, max: 100, grid: { color: "#E4E1D8" }, ticks: { color: "#5B6478" } },
      x: { grid: { display: false }, ticks: { color: "#3B4664", font: { size: 11 } } },
    },
  };

  return (
    <div className="flex flex-col gap-5 max-w-5xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Layers size={18} style={{ color: "var(--dl-teal)" }} />
          <h2 className="font-display text-lg font-semibold">Sessions</h2>
        </div>

        {batches.length > 0 && (
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium" style={{ color: "var(--dl-slate)" }}>Batch</label>
            <select
              value={batch}
              onChange={(e) => setBatch(e.target.value)}
              className="rounded-lg px-3 py-2 text-sm font-medium"
              style={{ border: "1px solid var(--dl-line)", background: "var(--dl-paper-raised)" }}
            >
              {batches.map((b) => (
                <option key={b} value={b}>Batch {b}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {batches.length === 0 ? (
        <div className="rounded-xl p-6 text-sm text-center" style={{ background: "var(--dl-paper-raised)", border: "1px solid var(--dl-line)", color: "var(--dl-slate)" }}>
          No students yet — add one to see their session here.
        </div>
      ) : (
        <>
          <div className="flex items-center gap-6 text-sm" style={{ color: "var(--dl-slate)" }}>
            <span>{batchStudents.length} student{batchStudents.length !== 1 ? "s" : ""} in Batch {batch}</span>
            <span>Average risk score: <span className="font-mono-num font-semibold" style={{ color: "var(--dl-ink)" }}>{avgRisk}</span></span>
          </div>

          <div className="rounded-xl p-5" style={{ background: "var(--dl-paper-raised)", border: "1px solid var(--dl-line)" }}>
            <p className="text-sm font-semibold mb-4">Risk score by student — Batch {batch}</p>
            {batchStudents.length > 0 ? (
              <Bar data={chartData} options={chartOptions} />
            ) : (
              <p className="text-sm" style={{ color: "var(--dl-slate)" }}>No students in this batch.</p>
            )}
          </div>

          <div className="rounded-xl overflow-hidden" style={{ background: "var(--dl-paper-raised)", border: "1px solid var(--dl-line)" }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--dl-line)" }}>
                  {["Name", "AG No.", "Program", "Progress", "Risk", "Last active"].map((h) => (
                    <th key={h} className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--dl-slate)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: "var(--dl-line)" }}>
                {batchStudents.map((s) => {
                  const band = bandFor(s.riskScore);
                  return (
                    <tr key={s.id} className="hover:bg-black/[0.02] transition-colors">
                      <td className="px-5 py-3">
                        <Link to={`/students/${s.id}`} className="font-medium" style={{ color: "var(--dl-ink)" }}>
                          {s.name}
                        </Link>
                      </td>
                      <td className="px-5 py-3" style={{ color: "var(--dl-ink-soft)" }}>{s.agNumber}</td>
                      <td className="px-5 py-3" style={{ color: "var(--dl-ink-soft)" }}>{s.program}</td>
                      <td className="px-5 py-3 font-mono-num" style={{ color: "var(--dl-ink-soft)" }}>{s.progressPct}%</td>
                      <td className="px-5 py-3">
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
                          style={{ background: band.soft, color: band.color }}
                        >
                          {s.riskScore} · {band.label}
                        </span>
                      </td>
                      <td className="px-5 py-3" style={{ color: "var(--dl-ink-soft)" }}>{s.lastActivity}</td>
                    </tr>
                  );
                })}
                {batchStudents.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center" style={{ color: "var(--dl-slate)" }}>
                      No students in this batch.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
