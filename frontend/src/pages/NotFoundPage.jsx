import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Logo from "../components/Logo";

/** Any URL the app doesn't know (B-20). */
export default function NotFoundPage() {
  const { isAuthenticated } = useAuth();
  return (
    <div className="not-found">
      <Link to="/" aria-label="DrawMaster home"><Logo size={40} /></Link>
      <h1>Page not found</h1>
      <p>That link is broken, or the page has moved.</p>
      <Link to={isAuthenticated ? "/dashboard" : "/"} className="btn btn-primary">
        {isAuthenticated ? "Go to your dashboard" : "Go to the home page"}
      </Link>
    </div>
  );
}
