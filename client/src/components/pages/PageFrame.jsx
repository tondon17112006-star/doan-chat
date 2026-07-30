// File: client/src/components/pages/PageFrame.jsx
import { HiMagnifyingGlass } from "react-icons/hi2";
import { useUiStore } from "../../store/uiStore.js";

export default function PageFrame({ eyebrow, title, subtitle, action, children, searchable = true }) {
  const setSearchOpen = useUiStore((state) => state.setSearchOpen);
  return (
    <main className="content-page">
      <header className="page-header">
        <div>
          {eyebrow && <span className="section-eyebrow">{eyebrow}</span>}
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <div className="page-header-actions">
          {searchable && <button type="button" className="page-search-button" onClick={() => setSearchOpen(true)}><HiMagnifyingGlass /> Search <kbd>⌘ K</kbd></button>}
          {action}
        </div>
      </header>
      <div className="page-content">{children}</div>
    </main>
  );
}
