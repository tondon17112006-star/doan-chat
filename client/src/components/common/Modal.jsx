// File: client/src/components/common/Modal.jsx
import { AnimatePresence, motion } from "framer-motion";
import { HiXMark } from "react-icons/hi2";

export default function Modal({ open, onClose, title, children, size = "md", className = "" }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}
        >
          <motion.section
            className={`modal-card modal-${size} ${className}`}
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 10 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            role="dialog"
            aria-modal="true"
          >
            {title && (
              <header className="modal-header">
                <h2>{title}</h2>
                <IconButtonClose onClick={onClose} />
              </header>
            )}
            {children}
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function IconButtonClose({ onClick }) {
  return (
    <button type="button" className="modal-close" onClick={onClick} aria-label="Close">
      <HiXMark />
    </button>
  );
}
