"use client";

import { MasterPage } from "@/components/shared/master-page";

export default function StatusesPage() {
  return (
    <MasterPage
      config={{
        title: "Statuses",
        endpoint: "/statuses",
        entityName: "Status",
        hasColor: true,
      }}
    />
  );
}
