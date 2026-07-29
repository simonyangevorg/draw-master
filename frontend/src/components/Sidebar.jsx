import React from "react";
import { NavLink, Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const linkClass = ({ isActive }) =>
    `sidebar-link${isActive ? " sidebar-link-active" : ""}`;

  return (
    <aside className="sidebar">
      <Link to="/" className="sidebar-logo">
        <img src="/logo.png" alt="FPTC" className="sidebar-logo-img" />
      </Link>
      <nav className="sidebar-nav">
        <NavLink to="/dashboard" end className={linkClass}>
          <span>🏠</span> Dashboard
        </NavLink>
        <NavLink to="/tournaments" end className={linkClass}>
          <span>🏆</span> Tournaments
        </NavLink>
        {user?.role === "ORGANISER" && (
          <NavLink to="/tournaments/new" className={linkClass}>
            <span>➕</span> New Tournament
          </NavLink>
        )}
        <NavLink to="/profile" className={linkClass}>
          <span>👤</span> Profile
        </NavLink>
      </nav>
      <div className="sidebar-footer">
        <div className="sidebar-user">
          <div className="sidebar-avatar">{user?.name?.[0]?.toUpperCase()}</div>
          <div>
            <div className="sidebar-user-name">{user?.name}</div>
            <div className="sidebar-user-role">{user?.role}</div>
          </div>
        </div>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => { logout(); navigate("/"); }}
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
