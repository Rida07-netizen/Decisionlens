import { Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { StudentAuthProvider } from "./context/StudentAuthContext";
import { AdminAuthProvider } from "./context/AdminAuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import StudentProtectedRoute from "./components/StudentProtectedRoute";
import AdminProtectedRoute from "./components/AdminProtectedRoute";
import AppLayout from "./layouts/AppLayout";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Dashboard from "./pages/Dashboard";
import AddMilestone from "./pages/AddMilestone";
import StudentRequirements from "./pages/StudentRequirements";
import DocumentReview from "./pages/DocumentReview";
import StudentDetail from "./pages/StudentDetail";
import Students from "./pages/Students";
import AddStudent from "./pages/AddStudent";
import SupervisorRequests from "./pages/SupervisorRequests";
import Sessions from "./pages/Sessions";
import History from "./pages/History";
import Interventions from "./pages/Interventions";
import Assistant from "./pages/Assistant";
import Settings from "./pages/Settings";
import StudentLogin from "./pages/StudentLogin";
import StudentSignup from "./pages/StudentSignup";
import StudentPortal from "./pages/StudentPortal";
import AdminLogin from "./pages/AdminLogin";
import AdminSignup from "./pages/AdminSignup";
import AdminDashboard from "./pages/AdminDashboard";

export default function App() {
  return (
    <AuthProvider>
      <StudentAuthProvider>
        <AdminAuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/student/login" element={<StudentLogin />} />
            <Route path="/student/signup" element={<StudentSignup />} />
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin/signup" element={<AdminSignup />} />

            <Route element={<StudentProtectedRoute />}>
              <Route path="/student/portal" element={<StudentPortal />} />
            </Route>

            <Route element={<AdminProtectedRoute />}>
              <Route path="/admin/dashboard" element={<AdminDashboard />} />
            </Route>

            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/students" element={<Students />} />
                <Route path="/students/new" element={<AddStudent />} />
                <Route path="/requests" element={<SupervisorRequests />} />
                <Route path="/students/:id" element={<StudentDetail />} />
                <Route path="/students/:id/requirements" element={<StudentRequirements />} />
                <Route path="/students/:id/requirements/:milestoneName/review" element={<DocumentReview />} />
                <Route path="/add-milestone" element={<AddMilestone />} />
                <Route path="/sessions" element={<Sessions />} />
                <Route path="/history" element={<History />} />
                <Route path="/interventions" element={<Interventions />} />
                <Route path="/assistant" element={<Assistant />} />
                <Route path="/settings" element={<Settings />} />
              </Route>
            </Route>
          </Routes>
        </AdminAuthProvider>
      </StudentAuthProvider>
    </AuthProvider>
  );
}
