import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Barre de navigation.
 *
 * Corrections : un seul élément `<header>` (il était imbriqué dans un autre `<header>` dans App),
 * liens adaptés à l'état de connexion (« Mes Tâches » n'apparaît plus pour un visiteur,
 * ajout de « Inscription »), et la déconnexion appelle l'API puis redirige vers `/login`
 * (avant, l'utilisateur restait sur la page des tâches après s'être déconnecté).
 *
 * @component
 * @returns {JSX.Element}
 */
export default function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <header className="header">
      <Link to="/" className="brand">
        Mes Tâches
      </Link>
      <nav aria-label="Navigation principale">
        <ul className="nav-list">
          {user ? (
            <>
              <li>
                <NavLink to="/tasks" className="nav-link">
                  Mes Tâches
                </NavLink>
              </li>
              <li className="nav-user" title="Utilisateur connecté">
                {user.username}
              </li>
              <li>
                <button type="button" onClick={handleLogout} className="nav-link nav-button">
                  Déconnexion
                </button>
              </li>
            </>
          ) : (
            <>
              <li>
                <NavLink to="/login" className="nav-link">
                  Connexion
                </NavLink>
              </li>
              <li>
                <NavLink to="/register" className="nav-link">
                  Inscription
                </NavLink>
              </li>
            </>
          )}
        </ul>
      </nav>
    </header>
  );
}
