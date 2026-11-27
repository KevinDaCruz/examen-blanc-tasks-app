import { useEffect, useState } from 'react';
import api, { getErrorMessage } from '../api';
import Alert from '../components/Alert';
import TaskForm from '../components/TaskForm';
import TaskItem from '../components/TaskItem';

/**
 * Page « Mes Tâches » (route protégée).
 *
 * Corrections :
 * - une tâche ajoutée apparaît immédiatement (avant : `addTask` ne mettait pas l'état à jour,
 *   il fallait rafraîchir la page) ;
 * - le chargement est protégé par try/catch avec message d'erreur et indicateur de chargement
 *   (avant : promesse rejetée non gérée et liste vide sans explication) ;
 * - ajout de la modification et du changement de statut d'une tâche ;
 * - les mises à jour d'état utilisent la forme fonctionnelle `setTasks(prev => …)`
 *   pour ne pas écraser des modifications concurrentes.
 *
 * @component
 * @returns {JSX.Element}
 */
export default function Tasks() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api
      .get('/tasks')
      .then((res) => !cancelled && setTasks(res.data))
      .catch((err) => !cancelled && setError(getErrorMessage(err, 'Impossible de charger vos tâches.')))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const addTask = (task) => setTasks((prev) => [task, ...prev]);

  const updateTask = async (id, changes) => {
    setError('');
    try {
      const res = await api.put(`/tasks/${id}`, changes);
      setTasks((prev) => prev.map((t) => (t._id === id ? res.data : t)));
      return true;
    } catch (err) {
      setError(getErrorMessage(err, 'Impossible de modifier la tâche.'));
      return false;
    }
  };

  const deleteTask = async (id) => {
    setError('');
    try {
      await api.delete(`/tasks/${id}`);
      setTasks((prev) => prev.filter((t) => t._id !== id));
    } catch (err) {
      setError(getErrorMessage(err, 'Impossible de supprimer la tâche.'));
    }
  };

  const remaining = tasks.filter((t) => !t.isCompleted).length;

  return (
    <section className="container">
      <h1>Mes Tâches</h1>
      <TaskForm onAdd={addTask} />
      <Alert message={error} />
      {loading ? (
        <p className="loading">Chargement des tâches…</p>
      ) : tasks.length === 0 ? (
        <p className="empty">Aucune tâche pour le moment. Ajoutez-en une ci-dessus.</p>
      ) : (
        <>
          <p className="counter">
            {remaining} tâche{remaining > 1 ? 's' : ''} restante{remaining > 1 ? 's' : ''} sur {tasks.length}
          </p>
          <ul className="task-list">
            {tasks.map((task) => (
              <TaskItem key={task._id} task={task} onUpdate={updateTask} onDelete={deleteTask} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
