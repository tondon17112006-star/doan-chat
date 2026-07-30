// File: client/src/components/common/IconButton.jsx
export default function IconButton({ icon, label, badge, active, className = "", ...props }) {
  return (
    <button
      type="button"
      className={`icon-button ${active ? "active" : ""} ${className}`}
      aria-label={label}
      title={label}
      {...props}
    >
      {icon}
      {badge ? <span className="icon-badge">{badge > 99 ? "99+" : badge}</span> : null}
    </button>
  );
}
