/**
 * Pied de page. L'année est calculée dynamiquement (elle était codée en dur à 2025).
 * @component
 * @returns {JSX.Element}
 */
export default function Footer() {
  return (
    <footer className="footer">
      <p>&copy; {new Date().getFullYear()} Application Mes Tâches</p>
    </footer>
  );
}
