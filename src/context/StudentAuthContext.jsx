import { createContext, useContext, useEffect, useState } from "react";
import { studentLogin as apiLogin, studentSignup as apiSignup, studentRegister as apiRegister } from "../api/client";

const StudentAuthContext = createContext(null);
const STORAGE_KEY = "decisionlens_student";

export function StudentAuthProvider({ children }) {
  const [student, setStudent] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setStudent(JSON.parse(stored));
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    setReady(true);
  }, []);

  const login = async (email, password) => {
    const data = await apiLogin({ email, password });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    setStudent(data);
    return data;
  };

  const signup = async (email, password) => {
    const data = await apiSignup({ email, password });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    setStudent(data);
    return data;
  };

  // Self-registration: no supervisor has added this student yet. They pick
  // one from the portal afterwards and wait for acceptance.
  const register = async (payload) => {
    const data = await apiRegister(payload);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    setStudent(data);
    return data;
  };

  const logout = () => {
    localStorage.removeItem(STORAGE_KEY);
    setStudent(null);
  };

  return (
    <StudentAuthContext.Provider value={{ student, ready, login, signup, register, logout }}>
      {children}
    </StudentAuthContext.Provider>
  );
}

export function useStudentAuth() {
  const ctx = useContext(StudentAuthContext);
  if (!ctx) throw new Error("useStudentAuth must be used within StudentAuthProvider");
  return ctx;
}
