interface DeleteDialogProps {
  count: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function DeleteDialog({ count, onConfirm, onCancel }: DeleteDialogProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onCancel}>
      <div className="bg-surface border border-border rounded-lg p-6 max-w-sm" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold mb-2 text-text">Delete</h3>
        <p className="text-text-muted text-sm mb-4">
          Are you sure you want to delete {count} item(s)? This action cannot be undone.
        </p>
        <div className="flex justify-end gap-2">
          <button
            className="px-4 py-1.5 text-sm rounded hover:bg-surface-alt text-text-muted"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="px-4 py-1.5 text-sm rounded bg-danger text-white hover:bg-danger/80"
            onClick={onConfirm}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
