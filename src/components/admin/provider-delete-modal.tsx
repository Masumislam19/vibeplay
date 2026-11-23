"use client";

import { useState } from "react";
import { LoaderCircle, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { apiRequest } from "@/lib/admin-client";

/**
 * Explicit, typed confirmation for deleting a video from Vidara. This uses the
 * documented /v1/video/delete endpoint and never runs as a side effect of a
 * local database removal.
 */
export function ProviderDeleteModal({
  videoId,
  filecode,
  onClose,
  onDeleted,
}: {
  videoId: string;
  filecode: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [confirmText, setConfirmText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function deleteOnVidara() {
    setLoading(true);
    setError(null);
    try {
      await apiRequest(`/api/admin/videos/${videoId}/provider`, {
        method: "POST",
        body: JSON.stringify({ confirmDeleteProvider: true }),
      });
      onDeleted();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
      setLoading(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Delete from Vidara" maxWidth="max-w-lg">
      <div className="flex gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs leading-relaxed text-red-200">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          This deletes <strong>{filecode}</strong> from Vidara using their documented delete
          endpoint. Vidara performs a soft delete — the video stops playing and leaves your file
          list. This action does <strong>not</strong> happen automatically when you remove a record
          from VibePlay.
        </span>
      </div>
      <div className="mt-4">
        <Label htmlFor="provider-delete-confirm">
          Type <strong>DELETE</strong> to confirm
        </Label>
        <Input
          id="provider-delete-confirm"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="DELETE"
          autoComplete="off"
        />
      </div>
      {error && (
        <p role="alert" className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </p>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" variant="danger" disabled={confirmText !== "DELETE" || loading} onClick={deleteOnVidara}>
          {loading && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Delete from Vidara
        </Button>
      </div>
    </Modal>
  );
}
