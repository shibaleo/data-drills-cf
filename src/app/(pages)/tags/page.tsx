"use client";

import { MasterPage } from "@/components/shared/master-page";

export default function TagsPage() {
  return (
    <MasterPage
      config={{
        title: "Tags",
        endpoint: "/tags",
        entityName: "Tag",
        hasColor: true,
      }}
    />
  );
}
