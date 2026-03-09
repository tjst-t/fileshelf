interface ToastProps {
  message: string;
  type: "success" | "error";
}

export default function Toast({ message, type }: ToastProps) {
  return (
    <div
      className={`fixed bottom-12 right-4 px-4 py-2 rounded shadow-lg text-sm z-50 ${
        type === "success" ? "bg-success text-bg" : "bg-danger text-white"
      }`}
    >
      {message}
    </div>
  );
}
