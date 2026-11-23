/** Serialized shapes returned by the admin JSON API. */

export interface AdminVideo {
  id: string;
  storageProvider: "supabase" | "legacy";
  legacyProvider: string | null;
  supabaseBucket: string | null;
  videoObjectPath: string | null;
  videoUrl: string | null;
  thumbnailObjectPath: string | null;
  thumbnailUrl: string | null;
  title: string;
  description: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categorySlug: string | null;
  durationSeconds: number | null;
  fileSizeBytes: number | null;
  mimeType: string | null;
  width: number | null;
  height: number | null;
  published: boolean;
  featured: boolean;
  ageRestricted: boolean;
  views: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  videoCount: number;
}

export interface AdminReportItem {
  id: string;
  videoId: string;
  videoTitle: string | null;
  videoThumbnail: string | null;
  videoPublished: boolean | null;
  reason: string;
  details: string | null;
  contactEmail: string | null;
  status: string;
  createdAt: string;
  resolvedAt: string | null;
}
