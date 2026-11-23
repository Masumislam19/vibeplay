import type { ReactNode } from "react";

export default function AdminAuthLayout({ children }: { children: ReactNode }) {
  return <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center py-10">{children}</div>;
}
