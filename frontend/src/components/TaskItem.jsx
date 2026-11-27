import { useState } from 'react';
import { DESCRIPTION_MAX, TITLE_MAX } from './TaskForm';

/**
 * Une tâche de la liste : case à cocher « terminée », édition en ligne et suppression.
 * (Ajout : l'interface ne permettait ni de modifier ni de terminer une tâche,
 * alors que la route `PUT /api/tasks/:id` existait.)
 *
 * Le contenu est rendu par React sous forme de texte (échappement automatique) :
 * jamais via `dangerouslySetInnerHTML`, ce qui empêche l'exécution de HTML/JS injecté.
 *
 * @component
 * @param {object} props
 * @param {{_id: string, title: string, description: string, isCompleted: boolean}} props.task
 * @param {function(string, object): Promise<boolean>} props.onUpdate - Renvoie `true` si la mise à jour a réussi.
 * @param {function(string): void} props.onDelete
 * @returns {JSX.Element}
 */
export default function TaskItem({ task, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || '');
  const [busy, setBusy] = useState(false);

  const run = async (fn) => {
    setBusy(true);
    try {
      return await fn();
    } finally {
      setBusy(false);
    }
  };

  const save = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    const ok = await run(() => onUpdate(task._id, { title: title.trim(), description: description.trim() }));
    if (ok) setEditing(false);
  };

  const startEdit = () => {
    setTitle(task.title);
    setDescription(task.description || '');
    setEditing(true);
  };

  const cancel = () => setEditing(false);

  const remove = () => {
    if (window.confirm(`Supprimer la tâche « ${task.title} » ?`)) run(() => onDelete(task._id));
  };

  if (editing) {
    return (
      <li className="task-item editing">
        <form onSubmit={save} className="task-edit">
          <input
            aria-label="Titre de la tâche"
            value={title}
            maxLength={TITLE_MAX}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
          <textarea
            aria-label="Description de la tâche"
            rows={2}
            value={description}
            maxLength={DESCRIPTION_MAX}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div className="task-actions">
            <button type="submit" className="btn-small btn-primary" disabled={busy || !title.trim()}>
              Enregistrer
            </button>
            <button type="button" className="btn-small btn-secondary" onClick={cancel} disabled={busy}>
              Annuler
            </button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className={`task-item ${task.isCompleted ? 'completed' : ''}`}>
      <label className="task-main">
        <input
          type="checkbox"
          checked={task.isCompleted}
          disabled={busy}
          onChange={() => run(() => onUpdate(task._id, { isCompleted: !task.isCompleted }))}
        />
        <span className="task-text">
          <span className="task-title">{task.title}</span>
          {task.description && <span className="task-description">{task.description}</span>}
        </span>
      </label>
      <div className="task-actions">
        <button type="button" className="btn-small btn-secondary" onClick={startEdit} disabled={busy}>
          Modifier
        </button>
        <button type="button" className="btn-small btn-danger" onClick={remove} disabled={busy}>
          Supprimer
        </button>
      </div>
    </li>
  );
}
