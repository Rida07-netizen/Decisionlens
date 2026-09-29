import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Search, LogOut, Settings as SettingsIcon } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { getStudents, getNotifications, markNotificationRead, markAllNotificationsRead } from "../api/client";

function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function initialsOf(name) {
  if (!name) return "?";
  const parts = name.replace(/^Dr\.?\s*/i, "").trim().split(/\s+/);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
}

export default function Topbar({ title, subtitle }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [students, setStudents] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const menuRef = useRef(null);
  const notifRef = useRef(null);
  const searchRef = useRef(null);

  useEffect(() => {
    if (user?.id) getStudents(user.id).then(setStudents).catch(() => setStudents([]));
  }, [user?.id]);

  const loadNotifications = useCallback(() => {
    if (!user?.id) return;
    getNotifications({ supervisorId: user.id })
      .then(({ notifications, unreadCount }) => {
        setNotifications(notifications);
        setUnreadCount(unreadCount);
      })
      .catch(() => {});
  }, [user?.id]);

  // Poll every 20s so a new submission shows up without a manual refresh.
  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 20000);
    return () => clearInterval(interval);
  }, [loadNotifications]);

  useEffect(() => {
    function onClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
      if (searchRef.current && !searchRef.current.contains(e.target)) setSearchOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const toggleNotif = () => {
    const opening = !notifOpen;
    setNotifOpen(opening);
    if (opening && unreadCount > 0) {
      markAllNotificationsRead({ supervisorId: user.id })
        .then(() => setNotifications((prev) => prev.map((n) => ({ ...n, read: true }))))
        .then(() => setUnreadCount(0))
        .catch(() => {});
    }
  };

  const clickNotification = (n) => {
    setNotifOpen(false);
    if (n.link) navigate(n.link);
  };

  const filteredStudents =
    searchQuery.trim().length > 0
      ? students.filter((s) => {
          const q = searchQuery.trim().toLowerCase();
          return (
            s.name.toLowerCase().includes(q) ||
            String(s.agNumber || "").toLowerCase().includes(q)
          );
        })
      : [];

  const goToStudent = (id) => {
    setSearchQuery("");
    setSearchOpen(false);
    navigate(`/students/${id}`);
  };

  return (
    <header
      className="min-h-16 py-3 flex items-center justify-between px-6 border-b sticky top-0 z-10"
      style={{ borderColor: "var(--dl-line)", background: "rgba(247,245,241,0.9)", backdropFilter: "blur(6px)" }}
    >
      <div>
        <h1 className="font-display leading-tight">{title}</h1>
        {subtitle && (
          <p className="text-sm" style={{ color: "var(--dl-slate)" }}>
            {subtitle}
          </p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="relative hidden sm:block" ref={searchRef}>
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm"
            style={{ background: "var(--dl-paper-raised)", border: "1px solid var(--dl-line)", color: "var(--dl-slate)" }}
          >
            <Search size={15} />
            <input
              type="text"
              placeholder="Search students…"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSearchOpen(true);
              }}
              onFocus={() => setSearchOpen(true)}
              className="bg-transparent outline-none w-40"
              style={{ color: "var(--dl-ink)" }}
            />
          </div>

          {searchOpen && searchQuery.trim().length > 0 && (
            <div
              className="absolute right-0 mt-2 w-72 rounded-lg overflow-hidden shadow-lg z-20"
              style={{ background: "var(--dl-paper-raised)", border: "1px solid var(--dl-line)" }}
            >
              {filteredStudents.length > 0 ? (
                filteredStudents.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => goToStudent(s.id)}
                    className="w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-black/[0.03] transition-colors text-left"
                  >
                    <span>
                      <span className="font-medium">{s.name}</span>
                      <span style={{ color: "var(--dl-slate)" }}> — AG No. {s.agNumber}</span>
                    </span>
                    <span className="text-xs" style={{ color: "var(--dl-coral)" }}>{s.riskLevel}</span>
                  </button>
                ))
              ) : (
                <p className="px-4 py-3 text-sm" style={{ color: "var(--dl-slate)" }}>
                  No students match "{searchQuery}"
                </p>
              )}
            </div>
          )}
        </div>

        <div className="relative" ref={notifRef}>
          <button
            onClick={toggleNotif}
            className="w-9 h-9 rounded-full flex items-center justify-center relative"
            style={{ background: "var(--dl-paper-raised)", border: "1px solid var(--dl-line)" }}
          >
            <Bell size={16} />
            {unreadCount > 0 && (
              <span
                className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full"
                style={{ background: "var(--dl-coral)" }}
              />
            )}
          </button>

          {notifOpen && (
            <div
              className="absolute right-0 mt-2 w-80 rounded-lg overflow-hidden shadow-lg z-20 max-h-96 overflow-y-auto"
              style={{ background: "var(--dl-paper-raised)", border: "1px solid var(--dl-line)" }}
            >
              <div className="px-4 py-3 border-b" style={{ borderColor: "var(--dl-line)" }}>
                <p className="text-sm font-medium">Notifications</p>
              </div>
              {notifications.length > 0 ? (
                notifications.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => clickNotification(n)}
                    className="w-full text-left px-4 py-2.5 text-sm border-b last:border-b-0 hover:bg-black/[0.03] transition-colors"
                    style={{ borderColor: "var(--dl-line)" }}
                  >
                    <p>{n.message}</p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--dl-slate)" }}>{timeAgo(n.createdAt)}</p>
                  </button>
                ))
              ) : (
                <p className="px-4 py-3 text-sm" style={{ color: "var(--dl-slate)" }}>
                  No new notifications
                </p>
              )}
            </div>
          )}
        </div>

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold"
            style={{ background: "var(--dl-ink)", color: "var(--dl-paper)" }}
            title={user?.name}
          >
            {initialsOf(user?.name)}
          </button>

          {menuOpen && (
            <div
              className="absolute right-0 mt-2 w-56 rounded-lg overflow-hidden shadow-lg z-20"
              style={{ background: "var(--dl-paper-raised)", border: "1px solid var(--dl-line)" }}
            >
              <div className="px-4 py-3 border-b" style={{ borderColor: "var(--dl-line)" }}>
                <p className="text-sm font-medium truncate">{user?.name}</p>
                <p className="text-xs truncate" style={{ color: "var(--dl-slate)" }}>{user?.email}</p>
              </div>
              <button
                onClick={() => { setMenuOpen(false); navigate("/settings"); }}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-black/[0.03] transition-colors"
              >
                <SettingsIcon size={15} /> Settings
              </button>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-black/[0.03] transition-colors"
                style={{ color: "var(--dl-coral)" }}
              >
                <LogOut size={15} /> Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}