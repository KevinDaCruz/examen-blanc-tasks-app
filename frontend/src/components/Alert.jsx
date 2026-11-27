/**
 * Message de retour utilisateur (erreur ou succès), annoncé aux lecteurs d'écran.
 *
 * @component
 * @param {object} props
 * @param {string} [props.message] - Texte à afficher ; rien n'est rendu s'il est vide.
 * @param {'error'|'success'} [props.type='error']
 * @returns {JSX.Element|null}
 */
export default function Alert({ message, type = 'error' }) {
  if (!message) return null;
  return (
    <div className={`alert alert-${type}`} role={type === 'error' ? 'alert' : 'status'}>
      {message}
    </div>
  );
}
