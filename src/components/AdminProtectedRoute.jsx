import { Navigate, Outlet } from "react-router-dom";
import { useAdminAuth } from "../context/AdminAuthContext";
import { LoadingState } from "./LoadingState";

export default function AdminProtectedRoute() {
  const { admin, ready } = useAdminAuth();

  if (!ready) return <LoadingState label="Checking session…" />;
  if (!admin) return <Navigate to="/admin/login" replace />;

  return <Outlet />;
}
