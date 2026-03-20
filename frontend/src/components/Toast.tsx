interface ToastProps {
  message: string;
  type: "success" | "error";
  onDismiss: () => void;
}

export default function Toast({ message, type, onDismiss }: ToastProps) {
  return (
    <div
      className={`fixed bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-md text-[13px] z-[2000] border cursor-pointer ${
        type === "success"
          ? "bg-surface-raised border-border-subtle text-text"
          : "bg-danger/15 border-danger/30 text-danger"
      }`}
      style={{ boxShadow: "var(--shadow-toast)" }}
      onClick={onDismiss}
    >
      {message}
      <span className="text-text-dim hover:text-text ml-1">&times;</span>
    </div>
  );
}
