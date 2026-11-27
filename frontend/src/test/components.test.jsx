import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '../api';
import TaskForm from '../components/TaskForm';
import TaskItem from '../components/TaskItem';
import Login from '../pages/Login';
import { validateRegister } from '../utils/validation';
import { AuthContext } from '../context/AuthContext';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, default: { post: vi.fn(), put: vi.fn(), get: vi.fn(), delete: vi.fn() } };
});

beforeEach(() => vi.clearAllMocks());

describe('TaskForm', () => {
  it("n'envoie pas un titre vide et affiche une erreur", async () => {
    const onAdd = vi.fn();
    render(<TaskForm onAdd={onAdd} />);
    await userEvent.click(screen.getByRole('button', { name: /ajouter/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/obligatoire/);
    expect(api.post).not.toHaveBeenCalled();
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('transmet la tâche créée au parent (mise à jour immédiate) et vide le champ', async () => {
    const task = { _id: '1', title: 'Réviser', isCompleted: false };
    api.post.mockResolvedValue({ data: task });
    const onAdd = vi.fn();
    render(<TaskForm onAdd={onAdd} />);
    await userEvent.type(screen.getByLabelText('Titre'), '  Réviser  ');
    await userEvent.click(screen.getByRole('button', { name: /ajouter/i }));
    expect(api.post).toHaveBeenCalledWith('/tasks', { title: 'Réviser', description: '' });
    expect(onAdd).toHaveBeenCalledWith(task);
    expect(screen.getByLabelText('Titre')).toHaveValue('');
  });

  it("affiche le message d'erreur renvoyé par l'API", async () => {
    api.post.mockRejectedValue({ response: { data: { msg: 'Le titre ne doit pas contenir de HTML' } } });
    render(<TaskForm onAdd={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Titre'), '<b>x</b>');
    await userEvent.click(screen.getByRole('button', { name: /ajouter/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('HTML');
  });
});

describe('TaskItem', () => {
  it('affiche le HTML injecté comme du texte (pas exécuté)', () => {
    const task = { _id: '1', title: '<img src=x onerror=alert(1)>', isCompleted: false };
    const { container } = render(<TaskItem task={task} onUpdate={vi.fn()} onDelete={vi.fn()} />);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText(task.title)).toBeInTheDocument();
  });

  it('permet de marquer une tâche comme terminée', async () => {
    const onUpdate = vi.fn().mockResolvedValue(true);
    render(<TaskItem task={{ _id: '1', title: 'A', isCompleted: false }} onUpdate={onUpdate} onDelete={vi.fn()} />);
    await userEvent.click(screen.getByRole('checkbox'));
    expect(onUpdate).toHaveBeenCalledWith('1', { isCompleted: true });
  });
});

describe('Login', () => {
  const renderLogin = () =>
    render(
      <AuthContext.Provider value={{ user: null, loading: false, setUser: vi.fn(), logout: vi.fn() }}>
        <MemoryRouter>
          <Login />
        </MemoryRouter>
      </AuthContext.Provider>,
    );

  it('signale les champs vides sans appeler l’API', async () => {
    renderLogin();
    await userEvent.click(screen.getByRole('button', { name: /se connecter/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/veuillez saisir/i);
    expect(api.post).not.toHaveBeenCalled();
  });

  it('affiche le message en cas de mauvais identifiants', async () => {
    api.post.mockRejectedValue({
      response: { status: 401, data: { msg: "Nom d'utilisateur ou mot de passe incorrect" } },
    });
    renderLogin();
    await userEvent.type(screen.getByLabelText(/nom d'utilisateur/i), 'alice');
    await userEvent.type(screen.getByLabelText(/mot de passe/i), 'mauvais');
    await userEvent.click(screen.getByRole('button', { name: /se connecter/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/incorrect/);
  });
});

describe('validateRegister', () => {
  it('applique les mêmes règles que le backend', () => {
    expect(validateRegister({ username: '', password: '', confirm: '' })).toMatch(/obligatoires/);
    expect(validateRegister({ username: 'ab', password: 'Password1', confirm: 'Password1' })).toMatch(/3 à 30/);
    expect(validateRegister({ username: 'alice', password: 'court', confirm: 'court' })).toMatch(/8 caractères/);
    expect(validateRegister({ username: 'alice', password: 'Password1', confirm: 'Password2' })).toMatch(
      /correspondent/,
    );
    expect(validateRegister({ username: 'alice', password: 'Password1', confirm: 'Password1' })).toBe('');
  });
});
