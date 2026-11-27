import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Garde de route pour les pages réservées aux visiteurs (connexion, inscription) :
 * un utilisateur déjà connecté est renvoyé vers ses tâches.
 * @component
 * @returns {JSX.Element}
 */
export default function PublicOnlyRoute() {
  const { user, loading } = useAuth();
  if (loading) return <p className="loading">Chargement…</p>;
  if (user) return <Navigate to="/tasks" replace />;
  return <Outlet />;
}
