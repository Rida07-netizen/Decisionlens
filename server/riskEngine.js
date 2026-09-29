// Risk engine: computes a 0-100 risk score from raw milestone data,
// so the score always reflects the current state of the datastore
// instead of being a hardcoded number. This is the "AI prediction"
// layer the front-end plan calls for (Week 4/5 integration).

const DAY_MS = 1000 * 60 * 60 * 24;

function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / DAY_MS);
}

function computeMilestoneStatus(m, today) {
  if (m.submitted) {
    const delay = daysBetween(m.due, m.submitted);
    if (delay <= 0) return delay < 0 ? "Early" : "On time";
    return "Late";
  }
  return new Date(m.due) < today ? "Overdue" : "Upcoming";
}

function computeStudent(student, today = new Date()) {
  const milestones = student.milestones.map((m) => {
    // Strip the large raw-text blob before this ever leaves the server —
    // it's only needed internally for originality comparisons, never by the UI.
    let analysis = m.analysis;
    if (analysis && analysis.rawText !== undefined) {
      // eslint-disable-next-line no-unused-vars
      const { rawText, ...rest } = analysis;
      analysis = rest;
    }
    return { ...m, analysis, status: computeMilestoneStatus(m, today) };
  });

  const submitted = milestones.filter((m) => m.submitted);
  const overdue = milestones.filter((m) => m.status === "Overdue");
  const lateOnes = milestones.filter((m) => m.status === "Late");

  const avgDelayDays =
    submitted.length === 0
      ? 0
      : submitted.reduce((sum, m) => sum + Math.max(0, daysBetween(m.due, m.submitted)), 0) / submitted.length;

  const lastActivityDate = submitted.length
    ? submitted.reduce((latest, m) => (new Date(m.submitted) > new Date(latest) ? m.submitted : latest), submitted[0].submitted)
    : null;

  const projectStart = student.createdAt || "2026-02-01";
  // Clamped at 0: a submission/creation date after "today" (e.g. a data-entry
  // slip) should never produce a negative inactivity score.
  const daysSinceActivity = Math.max(0, lastActivityDate ? daysBetween(lastActivityDate, today) : daysBetween(projectStart, today));

  const meetingsMissed = (student.meetingsScheduled || 0) - (student.meetingsAttended || 0);
  const meetingAttendanceRate = student.meetingsScheduled
    ? student.meetingsAttended / student.meetingsScheduled
    : 1;

  const progressPct = milestones.length ? Math.round((submitted.length / milestones.length) * 100) : 0;

  // Document content quality — only counts milestones that were both
  // submitted AND had their file successfully analyzed (analysis.supported).
  const analyzed = submitted.filter((m) => m.analysis && m.analysis.supported && m.analysis.completenessScore !== null);
  const avgCompleteness = analyzed.length
    ? analyzed.reduce((sum, m) => sum + m.analysis.completenessScore, 0) / analyzed.length
    : null;
  const placeholderCount = analyzed.filter((m) => m.analysis.isPlaceholder).length;

  // Weighted risk formula — each component capped before weighting so
  // one extreme input can't single-handedly blow past 100.
  const delayScore = Math.min(avgDelayDays * 2.2, 30);          // submission delay pattern
  const inactivityScore = Math.min(daysSinceActivity * 1.2, 26); // days since last activity
  const overdueScore = Math.min(overdue.length * 12, 24);        // overdue milestone count
  const meetingScore = Math.min(meetingsMissed * 5, 14);         // missed meetings
  const contentScore =
    avgCompleteness === null ? 0 : Math.min((100 - avgCompleteness) * 0.2 + placeholderCount * 10, 26); // weak/placeholder submissions

  const scoreTotal = delayScore + inactivityScore + overdueScore + meetingScore + contentScore || 1;
  const aiRiskScore = Math.max(0, Math.min(100, Math.round(delayScore + inactivityScore + overdueScore + meetingScore + contentScore)));
  const aiRiskLevel = aiRiskScore >= 70 ? "High" : aiRiskScore >= 40 ? "Moderate" : "Low";

  const factors = [
    {
      name: "Milestone submission delays",
      weight: Math.round((delayScore / scoreTotal) * 100),
      note:
        lateOnes.length > 0
          ? `${lateOnes.length} milestone(s) submitted late, averaging ${avgDelayDays.toFixed(1)} days over deadline.`
          : "No late submissions on record.",
    },
    {
      name: "Days since last activity",
      weight: Math.round((inactivityScore / scoreTotal) * 100),
      note: lastActivityDate
        ? `Last submission was ${daysSinceActivity} day(s) ago (${lastActivityDate}).`
        : `No milestone submitted yet — ${daysSinceActivity} day(s) since project start.`,
    },
    {
      name: "Overdue milestones",
      weight: Math.round((overdueScore / scoreTotal) * 100),
      note: overdue.length > 0
        ? `${overdue.length} milestone(s) past due with nothing submitted: ${overdue.map((m) => m.name).join(", ")}.`
        : "No milestones are currently overdue.",
    },
    {
      name: "Meeting attendance",
      weight: Math.round((meetingScore / scoreTotal) * 100),
      note: `Attended ${student.meetingsAttended}/${student.meetingsScheduled} scheduled meetings (${Math.round(meetingAttendanceRate * 100)}%).`,
    },
    {
      name: "Submission content quality",
      weight: Math.round((contentScore / scoreTotal) * 100),
      note:
        avgCompleteness === null
          ? "No submitted documents have been analyzed yet."
          : placeholderCount > 0
          ? `${placeholderCount} submission(s) look like placeholder/empty content. Average completeness ${Math.round(avgCompleteness)}%.`
          : `Average document completeness ${Math.round(avgCompleteness)}% across analyzed submissions.`,
    },
  ].sort((a, b) => b.weight - a.weight);

  const topFactor = factors[0];
  const explanation =
    aiRiskLevel === "High"
      ? `${student.name} is flagged high-risk primarily due to ${topFactor.name.toLowerCase()}. ${topFactor.note} An early check-in is recommended before the next milestone deadline.`
      : aiRiskLevel === "Moderate"
      ? `${student.name} shows some risk signals, mainly ${topFactor.name.toLowerCase()}. ${topFactor.note} Worth monitoring rather than urgent.`
      : `${student.name} is tracking well with no major risk signals. ${topFactor.note}`;

  // A supervisor can override the AI's overall verdict after reviewing the
  // actual documents. The AI's own number is always still returned
  // (aiRiskScore/aiRiskLevel) so the override is visible as a correction,
  // not a silent replacement.
  const override = student.riskOverride || null;
  const riskScore = override ? override.score : aiRiskScore;
  const riskLevel = override ? override.level : aiRiskLevel;

  // eslint-disable-next-line no-unused-vars
  const { passwordHash, riskOverride, ...safeStudent } = student;

  return {
    ...safeStudent,
    milestones,
    progressPct,
    lastActivity: lastActivityDate ? `${daysSinceActivity} day(s) ago` : `${daysSinceActivity} day(s) since start`,
    riskScore,
    riskLevel,
    aiRiskScore,
    aiRiskLevel,
    isRiskOverridden: !!override,
    riskOverrideNote: override ? override.note : null,
    factors,
    explanation,
  };
}

module.exports = { computeStudent, daysBetween };
