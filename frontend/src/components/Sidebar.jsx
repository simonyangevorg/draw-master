import React from "react";
import { NavLink, Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Logo from "./Logo";
import { ROLE_LABEL, label } from "../constants";

export default function Sidebar() {
  const { user, logout, isSuperAdmin, canCreateTournaments, adminClubs } = useAuth();
  const navigate = useNavigate();

  const linkClass = ({ isActive }) =>
    `sidebar-link${isActive ? " sidebar-link-active" : ""}`;

  return (
    <aside className="sidebar">
      <Link to="/" className="sidebar-logo">
        <Logo size={30} />
      </Link>
      <nav className="sidebar-nav">
        <NavLink to="/dashboard" end className={linkClass}>
          <span>🏠</span> Dashboard
        </NavLink>
        <NavLink to="/tournaments" end className={linkClass}>
          <span>🏆</span> Tournaments
        </NavLink>
        {canCreateTournaments && (
          <NavLink to="/tournaments/new" className={linkClass}>
            <span>➕</span> New Tournament
          </NavLink>
        )}
        {adminClubs.length > 0 && (
          <NavLink to="/club-presets" className={linkClass}>
            <span>📏</span> Match rules
          </NavLink>
        )}
        <NavLink to="/clubs" className={linkClass}>
          <span>🏟️</span> Clubs
        </NavLink>
        {isSuperAdmin && (
          <NavLink to="/admin/clubs" className={linkClass}>
            <span>🛠️</span> Manage clubs
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
            <div className="sidebar-user-role">{label(ROLE_LABEL, user?.role)}</div>
          </div>
        </div>
        <Link to="/change-password" className="form-link" style={{ fontSize: ".8rem" }}>Change password</Link>
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
