import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../api';
import { AuthContext } from './AuthContext';

/**
 * Fournit l'état d'authentification à toute l'application.
 *
 * Le JWT est dans un cookie HttpOnly, illisible en JavaScript : au chargement,
 * on interroge `GET /api/auth/me` pour savoir si une session valide existe
 * (avant : on testait juste la présence d'un token dans `localStorage`, même expiré).
 * Un intercepteur axios déconnecte automatiquement l'utilisateur si l'API répond 401
 * (session expirée) au lieu de laisser une page vide sans explication.
 *
 * @component
 * @param {object} props
 * @param {React.ReactNode} props.children
 * @returns {JSX.Element}
 */
export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/auth/me')
      .then((res) => !cancelled && setUser(res.data.user))
      .catch(() => !cancelled && setUser(null))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const id = api.interceptors.response.use(
      (res) => res,
      (err) => {
        const url = err.config?.url || '';
        if (err.response?.status === 401 && !url.startsWith('/auth/')) setUser(null);
        return Promise.reject(err);
      },
    );
    return () => api.interceptors.response.eject(id);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo(() => ({ user, loading, setUser, logout }), [user, loading, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
