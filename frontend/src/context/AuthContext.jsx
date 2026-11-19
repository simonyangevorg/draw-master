import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE_URL } from "../config";
import { apiPost, errorMessage, refreshToken, toSession } from "../api";

const AuthContext = createContext(null);

function readSaved() {
  try {
    const saved = JSON.parse(localStorage.getItem("tennis_user") || "null");
    return saved ? { clubs: [], ...saved } : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const navigate = useNavigate();
  const [user, setUser] = useState(readSaved);

  const store = useCallback((session) => {
    localStorage.setItem("tennis_user", JSON.stringify(session));
    setUser(session);
    return session;
  }, []);

  // api.js dispatches these: a refresh that failed (drop the session and go
  // to login, instead of a hard window.location redirect), or one that
  // succeeded somewhere in the app (pick up the new clubs/role).
  useEffect(() => {
    function onExpired() {
      setUser(null);
      navigate("/login");
    }
    function onRefreshed(e) {
      setUser(e.detail);
    }
    window.addEventListener("tennis:session-expired", onExpired);
    window.addEventListener("tennis:session-refreshed", onRefreshed);
    return () => {
      window.removeEventListener("tennis:session-expired", onExpired);
      window.removeEventListener("tennis:session-refreshed", onRefreshed);
    };
  }, [navigate]);

  // Refresh once when the app loads, so club seats granted since the last
  // visit (or a sign-out elsewhere) take effect straight away (dev plan §1.2).
  useEffect(() => {
    if (readSaved()?.refreshToken) refreshToken();
  }, []);

  const signIn = useCallback(async (path, body, fallback) => {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await errorMessage(res, fallback));
    return store(toSession(await res.json()));
  }, [store]);

  const login = useCallback(
    (email, password) => signIn("/api/auth/login", { email, password }, "Invalid credentials"),
    [signIn],
  );

  const register = useCallback(
    ({ name, email, password }) => signIn("/api/auth/register", { name, email, password }, "Registration failed"),
    [signIn],
  );

  const changePassword = useCallback(async (currentPassword, newPassword) => {
    const res = await apiPost("/api/auth/password", { currentPassword, newPassword });
    if (!res.ok) throw new Error(await errorMessage(res, "Could not change the password"));
    return store(toSession(await res.json()));
  }, [store]);

  /** Re-read clubs and role now (after a change the user should see at once). */
  const refreshSession = useCallback(async () => {
    const next = await refreshToken();
    if (next) setUser(next);
    return next;
  }, []);

  /** Sign out here, and end the session server-side too (L-17). */
  const logout = useCallback(() => {
    const refresh = readSaved()?.refreshToken;
    if (refresh) {
      fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: refresh }),
      }).catch(() => {});
    }
    localStorage.removeItem("tennis_user");
    setUser(null);
  }, []);

  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const adminClubs = (user?.clubs ?? []).filter(c => c.role === "ADMIN");
  const isClubAdmin = useCallback(
    (clubId) => !!clubId && (user?.clubs ?? []).some(c => c.id === clubId && c.role === "ADMIN"),
    [user],
  );
  /** Can open a tournament somewhere: super-admin, or admin of at least one club. */
  const canCreateTournaments = isSuperAdmin || adminClubs.length > 0;

  return (
    <AuthContext.Provider value={{
      user, login, register, logout, changePassword, refreshSession,
      isAuthenticated: !!user, isSuperAdmin, isClubAdmin, adminClubs, canCreateTournaments,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
