/**
 * Page transition for the public site. A template (unlike a layout) is
 * re-mounted on every navigation, so this short CSS fade-and-rise plays each
 * time a page opens. CSS only: no JavaScript, nothing hidden if scripts fail,
 * and it is switched off entirely under prefers-reduced-motion (globals.css).
 */
export default function SiteTemplate({ children }) {
  return <div className="page-enter">{children}</div>;
}
