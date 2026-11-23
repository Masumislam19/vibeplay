"use client";

import { useState } from "react";
import { FolderTree, LoaderCircle, Pencil, Plus, RefreshCcw, Trash2 } from "lucide-react";
import { useAsyncLoader } from "@/hooks/use-async-loader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { apiRequest } from "@/lib/admin-client";
import type { AdminCategory } from "@/components/admin/admin-types";

export function CategoryManager() {
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AdminCategory | null>(null);
  const [deleting, setDeleting] = useState<AdminCategory | null>(null);

  // Loading/error lifecycle is shared between initial load and refreshes.
  const { loading, error, setError, reload } = useAsyncLoader(async () => {
    const res = await apiRequest<{ categories: AdminCategory[] }>("/api/admin/categories");
    setCategories(res.categories);
  });

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await apiRequest("/api/admin/categories", {
        method: "POST",
        body: JSON.stringify({ name, description: description || null }),
      });
      setName("");
      setDescription("");
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed.");
    } finally {
      setCreating(false);
    }
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setError(null);
    try {
      await apiRequest(`/api/admin/categories/${editing.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: editing.name, description: editing.description }),
      });
      setEditing(null);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rename failed.");
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setError(null);
    try {
      await apiRequest(`/api/admin/categories/${deleting.id}`, { method: "DELETE" });
      setDeleting(null);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
      setDeleting(null);
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={create} className="rounded-2xl border border-white/10 bg-panel/80 p-5">
        <h2 className="inline-flex items-center gap-2 font-display font-bold text-white">
          <Plus className="h-4 w-4 text-violet-400" aria-hidden="true" /> Create category
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="cat-name">Name</Label>
            <Input id="cat-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} placeholder="e.g. Travel" />
          </div>
          <div>
            <Label htmlFor="cat-description">Description (optional)</Label>
            <Textarea id="cat-description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} placeholder="Short summary shown on the category page" />
          </div>
        </div>
        <Button type="submit" className="mt-4" disabled={creating || !name.trim()}>
          {creating && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Create category
        </Button>
      </form>

      {error && (
        <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-300">
          {error}
        </p>
      )}

      <div className="rounded-2xl border border-white/10 bg-panel/80 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="inline-flex items-center gap-2 font-display font-bold text-white">
            <FolderTree className="h-4 w-4 text-cyan-400" aria-hidden="true" /> All categories
          </h2>
          <Button variant="ghost" size="sm" onClick={reload} disabled={loading}>
            <RefreshCcw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden="true" /> Refresh
          </Button>
        </div>

        {loading ? (
          <p className="py-6 text-center text-sm text-zinc-500">Loading…</p>
        ) : categories.length === 0 ? (
          <p className="py-6 text-center text-sm text-zinc-500">No categories yet — create the first one above.</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {categories.map((category) => (
              <li key={category.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-zinc-100">{category.name}</p>
                  <p className="text-xs text-zinc-500">
                    /{category.slug}
                    {category.description ? ` · ${category.description}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone="violet">{category.videoCount} videos</Badge>
                  <button
                    type="button"
                    onClick={() => setEditing(category)}
                    aria-label={`Rename ${category.name}`}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-zinc-400 transition hover:border-violet-500/40 hover:text-violet-300 cursor-pointer"
                  >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleting(category)}
                    aria-label={`Delete ${category.name}`}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-zinc-400 transition hover:border-red-500/40 hover:text-red-400 cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-[11px] leading-relaxed text-zinc-600">
          Deleting a category never deletes videos — they simply become uncategorized. The slug is
          permanent so existing links keep working.
        </p>
      </div>

      {editing && (
        <Modal open onClose={() => setEditing(null)} title={`Rename ${editing.name}`}>
          <form onSubmit={saveEdit} className="space-y-4">
            <div>
              <Label htmlFor="rename-name">Name</Label>
              <Input id="rename-name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} required maxLength={80} />
            </div>
            <div>
              <Label htmlFor="rename-description">Description</Label>
              <Textarea id="rename-description" value={editing.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} maxLength={300} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit">Save</Button>
            </div>
          </form>
        </Modal>
      )}

      {deleting && (
        <Modal open onClose={() => setDeleting(null)} title={`Delete ${deleting.name}`}>
          <p className="text-sm leading-relaxed text-zinc-400">
            Videos in this category are kept and become uncategorized. Continue?
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmDelete}>
              <Trash2 className="h-4 w-4" aria-hidden="true" /> Delete category
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
