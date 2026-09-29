import { Navigate, Outlet } from "react-router-dom";
import { useStudentAuth } from "../context/StudentAuthContext";
import { LoadingState } from "./LoadingState";

export default function StudentProtectedRoute() {
  const { student, ready } = useStudentAuth();

  if (!ready) return <LoadingState label="Checking session…" />;
  if (!student) return <Navigate to="/student/login" replace />;

  return <Outlet />;
}
