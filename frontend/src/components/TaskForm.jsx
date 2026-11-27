import { useState } from 'react';
import api, { getErrorMessage } from '../api';
import Alert from './Alert';

/** Longueur maximale d'un titre, identique à la règle du backend. */
export const TITLE_MAX = 100;
/** Longueur maximale d'une description, identique à la règle du backend. */
export const DESCRIPTION_MAX = 500;

/**
 * Formulaire d'ajout d'une tâche.
 *
 * Fonctionnement :
 * 1. Validation côté client (titre obligatoire, longueurs max.) : un formulaire vide
 *    n'est plus envoyé (avant : requête envoyée, erreur 500 silencieuse).
 * 2. `POST /api/tasks` avec le cookie de session (plus de token en `localStorage`).
 * 3. En cas de succès, la tâche créée est transmise au parent via `onAdd` pour une
 *    mise à jour immédiate de la liste, puis le formulaire est vidé.
 * 4. En cas d'échec, le message d'erreur du serveur est affiché (avant : `console.error` seulement).
 *
 * Le bouton est désactivé pendant l'envoi pour éviter les doubles soumissions.
 *
 * @component
 * @param {object} props
 * @param {function(object): void} props.onAdd - Appelé avec la tâche créée renvoyée par l'API.
 * @returns {JSX.Element}
 * @example <TaskForm onAdd={(task) => setTasks((prev) => [task, ...prev])} />
 */
export default function TaskForm({ onAdd }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setError('Le titre de la tâche est obligatoire.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const res = await api.post('/tasks', { title: cleanTitle, description: description.trim() });
      onAdd(res.data);
      setTitle('');
      setDescription('');
    } catch (err) {
      setError(getErrorMessage(err, "Impossible d'ajouter la tâche."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="task-form" noValidate>
      <Alert message={error} />
      <div className="form-group">
        <label htmlFor="task-title">Titre</label>
        <input
          id="task-title"
          type="text"
          placeholder="Ajouter une tâche…"
          value={title}
          maxLength={TITLE_MAX}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <div className="form-group">
        <label htmlFor="task-description">Description (optionnelle)</label>
        <textarea
          id="task-description"
          rows={2}
          value={description}
          maxLength={DESCRIPTION_MAX}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <button type="submit" className="btn" disabled={submitting}>
        {submitting ? 'Ajout…' : 'Ajouter la tâche'}
      </button>
    </form>
  );
}
