"use client";
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useField } from "@/hooks/use-project";
import { useCreateReviewScope } from "@/hooks/queries/use-review-scopes";
import { MemberFilterPicker } from "@/components/member-filter-picker";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { MemberFilterInput } from "@/lib/schemas/member-filter";

export default function ReviewScopeNewPage() {
  const { currentField } = useField();
  const navigate = useNavigate();
  const create = useCreateReviewScope(currentField?.id);

  const [name, setName] = useState("");
  const [filter, setFilter] = useState<MemberFilterInput>({});

  if (!currentField) return <div className="p-6 text-muted-foreground">Please select a project</div>;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const res = await create.mutateAsync({
      project_id: currentField!.id,
      name: name.trim(),
      filter,
    });
    navigate({ to: "/review/$scope_id" as string, params: { scope_id: res.data.id } });
  }

  return (
    <form onSubmit={onSubmit} className="p-4 md:p-6 space-y-6 max-w-4xl">
      <h1 className="text-2xl font-semibold">Create new review</h1>

      <div className="space-y-2">
        <Label>Name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Bookkeeping review" required />
      </div>

      <div className="space-y-2">
        <Label>Member filter (empty category = all)</Label>
        <MemberFilterPicker projectId={currentField.id} value={filter} onChange={setFilter} />
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={create.isPending || !name.trim()}>
          {create.isPending ? "Creating..." : "Create"}
        </Button>
        <Button type="button" variant="outline" onClick={() => navigate({ to: "/review" as string })}>Cancel</Button>
      </div>
    </form>
  );
}
