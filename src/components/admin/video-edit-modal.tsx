"use client";

import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea, Toggle } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { apiRequest } from "@/lib/admin-client";
import type { AdminCategory, AdminVideo } from "@/components/admin/admin-types";

export function VideoEditModal({
  video,
  categories,
  onClose,
  onSaved,
}: {
  video: AdminVideo;
  categories: AdminCategory[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(video.title);
  const [description, setDescription] = useState(video.description ?? "");
  const [categoryId, setCategoryId] = useState(video.categoryId ?? "");
  const [ageRestricted, setAgeRestricted] = useState(video.ageRestricted);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // State is initialised from props: the modal mounts fresh for each video
  // (its parent renders it conditionally with a stable key), so no
  // prop-syncing effect is needed.

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiRequest(`/api/admin/videos/${video.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title,
          description: description || null,
          categoryId: categoryId || null,
          ageRestricted,
        }),
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Edit — ${video.title}`} maxWidth="max-w-xl">
      <form onSubmit={save} className="space-y-4">
        <div>
          <Label htmlFor="edit-title">Title</Label>
          <Input id="edit-title" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={300} />
        </div>
        <div>
          <Label htmlFor="edit-description">Description</Label>
          <Textarea
            id="edit-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={5000}
            placeholder="What is this video about?"
          />
        </div>
        <div>
          <Label htmlFor="edit-category">Category</Label>
          <Select id="edit-category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">— No category —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <Toggle checked={ageRestricted} onChange={setAgeRestricted} label="Age-restricted (18+)" />
        {error && (
          <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Save changes
          </Button>
        </div>
      </form>
    </Modal>
  );
}
