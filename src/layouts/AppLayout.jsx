import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";

const pageMeta = {
  "/": { title: "Dashboard", subtitle: "Cohort overview — who needs attention this week" },
  "/students": { title: "My Students", subtitle: "Every FYP/thesis student you supervise, ranked by risk" },
  "/students/new": { title: "Add Student", subtitle: "Start tracking a new FYP/thesis student" },
  "/add-milestone": { title: "Add Milestone", subtitle: "Set a milestone with a real due date for a student" },
  "/sessions": { title: "Sessions", subtitle: "Your students grouped by batch, with a risk chart and table for each" },
  "/history": { title: "History", subtitle: "Students marked as completed — view their record or bring them back to the active roster" },
  "/interventions": { title: "Interventions", subtitle: "Actions taken with at-risk students and their outcomes" },
  "/assistant": { title: "AI Assistant", subtitle: "Ask about your cohort in plain language" },
  "/settings": { title: "Settings", subtitle: "Manage your profile and preferences" },
};

export default function AppLayout() {
  const location = useLocation();
  const meta =
    pageMeta[location.pathname] ||
    (location.pathname.endsWith("/review")
      ? { title: "Document Review", subtitle: "Read the document and share feedback with the student" }
      : location.pathname.endsWith("/requirements")
      ? { title: "Student Requirements", subtitle: "Manage this student's document requirements and feedback" }
      : location.pathname.startsWith("/students/")
      ? { title: "Student Detail", subtitle: "Milestone timeline and risk breakdown" }
      : { title: "DecisionLens", subtitle: "" });

  return (
    <div className="flex min-h-screen" style={{ background: "var(--dl-paper)" }}>
      <Sidebar />
      <div className="flex-1 min-w-0">
        <Topbar title={meta.title} subtitle={meta.subtitle} />
        <main className="p-6 max-w-6xl">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
