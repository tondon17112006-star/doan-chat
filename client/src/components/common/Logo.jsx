// File: client/src/components/common/Logo.jsx
export default function Logo({ compact = false }) {
  return (
    <div className={`brand ${compact ? "brand-compact" : ""}`}>
      <img src="/lumina-mark.svg" alt="" className="brand-mark" />
      {!compact && <span>Lumina</span>}
    </div>
  );
}
