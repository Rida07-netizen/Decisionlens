import { createContext, useContext, useEffect, useState } from "react";
import { supervisorLogin as apiLogin, supervisorSignup as apiSignup } from "../api/client";

const AuthContext = createContext(null);
const STORAGE_KEY = "decisionlens_user";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setUser(JSON.parse(stored));
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    setReady(true);
  }, []);

  const login = async (email, password) => {
    const data = await apiLogin({ email, password });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    setUser(data);
    return data;
  };

  const signup = async (name, email, password, institution) => {
    const data = await apiSignup({ name, email, password, institution });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    setUser(data);
    return data;
  };

  const logout = () => {
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
  };

  const updateLocalUser = (patch) => {
    setUser((prev) => {
      const next = { ...prev, ...patch };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  return (
    <AuthContext.Provider value={{ user, ready, login, signup, logout, updateLocalUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
