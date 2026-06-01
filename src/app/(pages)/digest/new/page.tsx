"use client";
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useProject } from "@/hooks/use-project";
import { useCreateDigestScope } from "@/hooks/queries/use-digest-scopes";
import { MemberFilterPicker } from "@/components/member-filter-picker";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { MemberFilterInput } from "@/lib/schemas/member-filter";

export default function DigestScopeNewPage() {
  const { currentProject } = useProject();
  const navigate = useNavigate();
  const create = useCreateDigestScope(currentProject?.id);

  const [name, setName] = useState("");
  const [filter, setFilter] = useState<MemberFilterInput>({});

  if (!currentProject) return <div className="p-6 text-muted-foreground">Please select a project</div>;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const res = await create.mutateAsync({
      project_id: currentProject!.id,
      name: name.trim(),
      filter,
    });
    navigate({ to: "/digest/$scopeId" as string, params: { scopeId: res.data.id } });
  }

  return (
    <form onSubmit={onSubmit} className="p-4 md:p-6 space-y-6 max-w-4xl">
      <h1 className="text-2xl font-semibold">Create new digest scope</h1>

      <div className="space-y-2">
        <Label>Name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. 簿記論 digest" required />
      </div>

      <div className="space-y-2">
        <Label>Member filter (empty category = all)</Label>
        <MemberFilterPicker projectId={currentProject.id} value={filter} onChange={setFilter} />
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={create.isPending || !name.trim()}>
          {create.isPending ? "Creating..." : "Create"}
        </Button>
        <Button type="button" variant="outline" onClick={() => navigate({ to: "/digest" as string })}>Cancel</Button>
      </div>
    </form>
  );
}
