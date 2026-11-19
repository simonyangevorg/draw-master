import React from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import DashboardPage from "./pages/DashboardPage";
import TournamentsPage from "./pages/TournamentsPage";
import ProfilePage from "./pages/ProfilePage";
import CreateTournamentPage from "./pages/CreateTournamentPage";
import TournamentDetailPage from "./pages/TournamentDetailPage";
import NotFoundPage from "./pages/NotFoundPage";
import ChangePasswordPage from "./pages/ChangePasswordPage";
import ClubsPage from "./pages/ClubsPage";
import AdminClubsPage from "./pages/AdminClubsPage";
import AdminClubPage from "./pages/AdminClubPage";
import "./index.css";

function PrivateRoute({ children }) {
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();
  // Remember where they were going, so login can send them back there (B-20).
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location }} />;
  // The bootstrapped super-admin must replace the initial password first (L-02).
  if (user?.mustChangePassword && location.pathname !== "/change-password") {
    return <Navigate to="/change-password" replace />;
  }
  return children;
}

/** Platform administration: the super-admin only (L-03). The API enforces it too. */
function SuperAdminRoute({ children }) {
  const { isSuperAdmin } = useAuth();
  return <PrivateRoute>{isSuperAdmin ? children : <NotFoundPage />}</PrivateRoute>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/dashboard" element={<PrivateRoute><DashboardPage /></PrivateRoute>} />
      <Route path="/tournaments" element={<PrivateRoute><TournamentsPage /></PrivateRoute>} />
      <Route path="/tournaments/new" element={<PrivateRoute><CreateTournamentPage /></PrivateRoute>} />
      <Route path="/tournaments/:id" element={<PrivateRoute><TournamentDetailPage /></PrivateRoute>} />
      <Route path="/profile" element={<PrivateRoute><ProfilePage /></PrivateRoute>} />
      <Route path="/change-password" element={<PrivateRoute><ChangePasswordPage /></PrivateRoute>} />
      <Route path="/clubs" element={<PrivateRoute><ClubsPage /></PrivateRoute>} />
      <Route path="/admin/clubs" element={<SuperAdminRoute><AdminClubsPage /></SuperAdminRoute>} />
      <Route path="/admin/clubs/:id" element={<SuperAdminRoute><AdminClubPage /></SuperAdminRoute>} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
