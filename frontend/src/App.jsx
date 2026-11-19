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
import "./index.css";

function PrivateRoute({ children }) {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  // Remember where they were going, so login can send them back there (B-20).
  return isAuthenticated ? children : <Navigate to="/login" replace state={{ from: location }} />;
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
