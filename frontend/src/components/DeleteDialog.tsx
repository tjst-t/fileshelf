interface DeleteDialogProps {
  count: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function DeleteDialog({ count, onConfirm, onCancel }: DeleteDialogProps) {
  return (
    <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "var(--overlay-bg)" }} onClick={onCancel}>
      <div
        className="bg-surface-raised border border-border-subtle rounded-md p-6 max-w-sm"
        style={{ boxShadow: "var(--shadow-float)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold mb-2 text-text">Delete</h3>
        <p className="text-text-muted text-[13px] mb-5">
          Are you sure you want to delete {count} item(s)? This action cannot be undone.
        </p>
        <div className="flex justify-end gap-2">
          <button
            className="px-4 py-1.5 text-xs rounded border border-border-subtle text-text-muted cursor-pointer hover:bg-surface-alt"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="px-4 py-1.5 text-xs rounded bg-danger text-white cursor-pointer hover:bg-danger/80"
            onClick={onConfirm}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
