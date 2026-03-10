interface ToastProps {
  message: string;
  type: "success" | "error";
}

export default function Toast({ message, type }: ToastProps) {
  return (
    <div
      className={`fixed bottom-5 left-1/2 -translate-x-1/2 px-4 py-2 rounded-md text-[13px] z-[2000] border ${
        type === "success"
          ? "bg-surface-raised border-border-subtle text-text"
          : "bg-danger/15 border-danger/30 text-danger"
      }`}
      style={{ boxShadow: "0 4px 20px rgba(0,0,0,0.4)" }}
    >
      {message}
    </div>
  );
}
