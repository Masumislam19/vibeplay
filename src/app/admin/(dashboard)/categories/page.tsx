import { CategoryManager } from "@/components/admin/category-manager";

export default function AdminCategoriesPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <h1 className="mb-1 font-display text-2xl font-bold text-white">
        Categories<span className="vibe-text">.</span>
      </h1>
      <p className="mb-6 text-sm text-zinc-500">Organize your catalog.</p>
      <CategoryManager />
    </div>
  );
}
