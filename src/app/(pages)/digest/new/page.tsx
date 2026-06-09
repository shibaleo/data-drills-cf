"use client";
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMasterField } from "@/hooks/use-master-field";
import { MasterFieldPicker } from "@/components/master-field-picker";
import { useCreateDigestScope } from "@/hooks/queries/use-digest-scopes";
import { MemberFilterPicker } from "@/components/member-filter-picker";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { MemberFilterInput } from "@/lib/schemas/member-filter";

export default function DigestScopeNewPage() {
  const { field } = useMasterField();
  const navigate = useNavigate();
  const create = useCreateDigestScope(field?.id);

  const [name, setName] = useState("");
  const [filter, setFilter] = useState<MemberFilterInput>({});

  if (!field) return <div className="p-6 text-muted-foreground">Select a field</div>;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const res = await create.mutateAsync({
      field_id: field!.id,
      name: name.trim(),
      filter,
    });
    navigate({ to: "/digest/$scope_id" as string, params: { scope_id: res.data.id } });
  }

  return (
    <form onSubmit={onSubmit} className="p-4 md:p-6 space-y-6 max-w-4xl">
      <h1 className="text-2xl font-semibold">Create new digest scope</h1>

      <div className="space-y-2">
        <Label>Field</Label>
        <MasterFieldPicker />
      </div>

      <div className="space-y-2">
        <Label>Name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. digest" required />
      </div>

      <div className="space-y-2">
        <Label>Member filter (empty category = all)</Label>
        <MemberFilterPicker fieldId={field.id} value={filter} onChange={setFilter} />
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
