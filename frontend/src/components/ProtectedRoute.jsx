import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Garde de route : n'affiche les routes enfants que si l'utilisateur est connecté,
 * sinon redirige vers `/login` (en mémorisant la page demandée).
 * @component
 * @returns {JSX.Element}
 */
export default function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <p className="loading">Chargement…</p>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}
