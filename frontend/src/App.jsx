import { Navigate, Route, Routes } from 'react-router-dom';
import Header from './components/Header';
import Footer from './components/Footer';
import ProtectedRoute from './components/ProtectedRoute';
import PublicOnlyRoute from './components/PublicOnlyRoute';
import Login from './pages/Login';
import Register from './pages/Register';
import Tasks from './pages/Tasks';

/**
 * Composant racine : mise en page (en-tête, contenu, pied de page) et routage.
 *
 * - `/tasks` est protégée : redirection vers `/login` si non connecté
 *   (avant, la page était accessible et affichait une liste vide).
 * - `/login` et `/register` redirigent vers `/tasks` si déjà connecté.
 * - Toute URL inconnue redirige vers l'accueil.
 *
 * @component
 * @returns {JSX.Element}
 */
export default function App() {
  return (
    <div className="app">
      <Header />
      <main className="main">
        <Routes>
          <Route path="/" element={<Navigate to="/tasks" replace />} />
          <Route element={<PublicOnlyRoute />}>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
          </Route>
          <Route element={<ProtectedRoute />}>
            <Route path="/tasks" element={<Tasks />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}
