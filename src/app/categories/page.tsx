import type { Metadata } from "next";
import { isMongoConfigured } from "@/db";
import { DatabaseNotice } from "@/components/ui/db-notice";
import { CategoryCard } from "@/components/videos/category-card";
import { EmptyState } from "@/components/videos/empty-state";
import { SectionHeader } from "@/components/videos/section-header";
import { listCategoriesWithCounts } from "@/server/services/videos";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Categories" };

export default async function CategoriesPage() {
  if (!isMongoConfigured()) return <DatabaseNotice />;
  const categories = await listCategoriesWithCounts(true);
  return (
    <div className="space-y-6">
      <SectionHeader title="Categories" hint="Every corner of the VibePlay catalog" />
      {categories.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((category, index) => (
            <CategoryCard
              key={category.id}
              slug={category.slug}
              name={category.name}
              videoCount={category.videoCount}
              index={index}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          title="No categories yet"
          hint="Create categories in the Admin Dashboard to organize your catalog."
          actionHref="/admin/categories"
          actionLabel="Manage categories"
        />
      )}
    </div>
  );
}
