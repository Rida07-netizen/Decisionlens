import { createContext, useContext, useEffect, useState } from "react";
import { adminLogin as apiLogin, adminSignup as apiSignup } from "../api/client";

const AdminAuthContext = createContext(null);
const STORAGE_KEY = "decisionlens_admin";

export function AdminAuthProvider({ children }) {
  const [admin, setAdmin] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setAdmin(JSON.parse(stored));
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    setReady(true);
  }, []);

  const login = async (email, password) => {
    const data = await apiLogin({ email, password });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    setAdmin(data);
    return data;
  };

  const signup = async (email, password) => {
    const data = await apiSignup({ email, password });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    setAdmin(data);
    return data;
  };

  const logout = () => {
    localStorage.removeItem(STORAGE_KEY);
    setAdmin(null);
  };

  return (
    <AdminAuthContext.Provider value={{ admin, ready, login, signup, logout }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error("useAdminAuth must be used within AdminAuthProvider");
  return ctx;
}
