import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const navigate = useNavigate();
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem("tennis_user");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // api.js dispatches this when a request 401s and the token refresh also
  // fails — react by dropping the session and navigating, instead of api.js
  // doing a hard window.location redirect (which only makes sense in a browser tab).
  useEffect(() => {
    function handleSessionExpired() {
      setUser(null);
      navigate("/login");
    }
    window.addEventListener("tennis:session-expired", handleSessionExpired);
    return () => window.removeEventListener("tennis:session-expired", handleSessionExpired);
  }, [navigate]);

  const login = useCallback(async (email, password) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || "Invalid credentials");
    }

    const data = await res.json();
    const userData = {
      id: data.user.id,
      email: data.user.email,
      name: data.user.name,
      role: data.user.role,
      token: data.token,
      refreshToken: data.refreshToken,
    };
    localStorage.setItem("tennis_user", JSON.stringify(userData));
    setUser(userData);
    return userData;
  }, []);

  const register = useCallback(async ({ name, email, password, role, clubId }) => {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, role, clubId: clubId || undefined }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || "Registration failed");
    }

    const data = await res.json();
    const userData = {
      id: data.user.id,
      email: data.user.email,
      name: data.user.name,
      role: data.user.role,
      token: data.token,
      refreshToken: data.refreshToken,
    };
    localStorage.setItem("tennis_user", JSON.stringify(userData));
    setUser(userData);
    return userData;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("tennis_user");
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, register, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
