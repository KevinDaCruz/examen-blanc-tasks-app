import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api, { getErrorMessage } from '../api';
import Alert from '../components/Alert';
import { useAuth } from '../context/AuthContext';
import { validateRegister } from '../utils/validation';

/**
 * Page d'inscription.
 *
 * Corrections : validation des champs (vides, longueur, complexité, confirmation),
 * affichage des erreurs serveur (ex: nom déjà pris), et connexion automatique après
 * inscription (avant : renvoi vers /login sans message, le token retourné était ignoré).
 *
 * @component
 * @returns {JSX.Element}
 */
export default function Register() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { setUser } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validationError = validateRegister({ username, password, confirm });
    if (validationError) {
      setError(validationError);
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await api.post('/auth/register', { username: username.trim(), password });
      setUser(res.data.user);
      navigate('/tasks', { replace: true });
    } catch (err) {
      setError(getErrorMessage(err, 'Inscription impossible.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="container">
      <h1>Inscription</h1>
      <Alert message={error} />
      <form onSubmit={handleSubmit} noValidate>
        <div className="form-group">
          <label htmlFor="register-username">Nom d&apos;utilisateur</label>
          <input
            id="register-username"
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label htmlFor="register-password">Mot de passe</label>
          <input
            id="register-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <small className="hint">8 caractères minimum, dont au moins une lettre et un chiffre.</small>
        </div>
        <div className="form-group">
          <label htmlFor="register-confirm">Confirmer le mot de passe</label>
          <input
            id="register-confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>
        <button type="submit" className="btn" disabled={submitting}>
          {submitting ? 'Création…' : 'Créer mon compte'}
        </button>
      </form>
      <p className="form-footer">
        Déjà un compte ? <Link to="/login">Se connecter</Link>
      </p>
    </section>
  );
}
