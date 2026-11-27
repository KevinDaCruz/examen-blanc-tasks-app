import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import api, { getErrorMessage } from '../api';
import Alert from '../components/Alert';
import { useAuth } from '../context/AuthContext';

/**
 * Page de connexion.
 *
 * Corrections : validation des champs vides avant envoi, affichage du message
 * d'erreur du serveur (« Nom d'utilisateur ou mot de passe incorrect », « Trop de
 * tentatives »…) au lieu d'un simple `console.error`, bouton désactivé pendant l'envoi.
 * Le token n'est plus stocké dans `localStorage` : le serveur pose un cookie HttpOnly.
 *
 * @component
 * @returns {JSX.Element}
 */
export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError("Veuillez saisir votre nom d'utilisateur et votre mot de passe.");
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await api.post('/auth/login', { username: username.trim(), password });
      setUser(res.data.user);
      navigate(location.state?.from || '/tasks', { replace: true });
    } catch (err) {
      setError(getErrorMessage(err, 'Connexion impossible.'));
      setPassword('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="container">
      <h1>Connexion</h1>
      <Alert message={error} />
      <form onSubmit={handleSubmit} noValidate>
        <div className="form-group">
          <label htmlFor="login-username">Nom d&apos;utilisateur</label>
          <input
            id="login-username"
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label htmlFor="login-password">Mot de passe</label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <button type="submit" className="btn" disabled={submitting}>
          {submitting ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>
      <p className="form-footer">
        Pas encore de compte ? <Link to="/register">Créer un compte</Link>
      </p>
    </section>
  );
}
