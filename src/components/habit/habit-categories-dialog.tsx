/**
 * Habit Category master の管理 dialog。
 *
 * /habits ページから開く。CRUD + reorder。
 * 削除時は habit.category_id が ON DELETE SET NULL で外れる (Other に落ちる)。
 */

import { useEffect, useState } from "react";
import { GripVertical, Plus, X, Pencil, Check } from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  type HabitCategoryRow,
  useCreateHabitCategory,
  useUpdateHabitCategory,
  useDeleteHabitCategory,
  useReorderHabitCategories,
} from "@/hooks/queries/use-habit-categories";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  categories: HabitCategoryRow[];
};

export function HabitCategoriesDialog({ open, onOpenChange, categories }: Props) {
  const createCat = useCreateHabitCategory();
  const updateCat = useUpdateHabitCategory();
  const deleteCat = useDeleteHabitCategory();
  const reorderCat = useReorderHabitCategories();

  const [newName, setNewName] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = categories.map((c) => c.id);
    const fromIdx = ids.indexOf(String(active.id));
    const toIdx = ids.indexOf(String(over.id));
    if (fromIdx < 0 || toIdx < 0) return;
    reorderCat.mutate(arrayMove(ids, fromIdx, toIdx));
  }

  useEffect(() => {
    if (!open) setNewName("");
  }, [open]);

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    try {
      await createCat.mutateAsync({ name, sort_order: categories.length });
      setNewName("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Manage categories</DialogTitle>
          <DialogDescription className="sr-only">Habit categories</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex gap-1.5">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleCreate(); } }}
              placeholder="New category name"
            />
            <Button
              type="button"
              size="sm"
              onClick={handleCreate}
              disabled={!newName.trim() || createCat.isPending}
              className="gap-1.5"
            >
              <Plus className="size-3.5" />
              Add
            </Button>
          </div>

          <div className="border rounded">
            {categories.length === 0 ? (
              <p className="text-sm text-muted-foreground italic text-center py-6">
                No categories yet.
              </p>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={categories.map((c) => c.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {categories.map((c) => (
                    <SortableCategoryRow
                      key={c.id}
                      category={c}
                      onRename={async (name) => {
                        try {
                          await updateCat.mutateAsync({ id: c.id, payload: { name } });
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : "Failed to rename");
                          throw e;
                        }
                      }}
                      onDelete={async () => {
                        if (!confirm(`Delete category "${c.name}"? Habits in it will become uncategorized.`)) return;
                        try {
                          await deleteCat.mutateAsync(c.id);
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : "Failed to delete");
                        }
                      }}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            )}
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SortableCategoryRow({
  category,
  onRename,
  onDelete,
}: {
  category: HabitCategoryRow;
  onRename: (name: string) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: category.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(category.name);

  useEffect(() => { setDraft(category.name); }, [category.name]);

  async function commit() {
    const name = draft.trim();
    if (!name || name === category.name) { setEditing(false); setDraft(category.name); return; }
    try {
      await onRename(name);
      setEditing(false);
    } catch {
      // toast handled upstream
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 px-2 py-1.5 border-b last:border-b-0 group"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        title="Drag to reorder"
        className="size-5 flex items-center justify-center text-muted-foreground/40 hover:text-foreground cursor-grab active:cursor-grabbing"
      >
        <GripVertical className="size-3.5" />
      </button>
      {editing ? (
        <Input
          value={draft}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commit(); }
            if (e.key === "Escape") { setEditing(false); setDraft(category.name); }
          }}
          onBlur={commit}
          className="h-7 text-sm"
        />
      ) : (
        <span className="flex-1 text-sm truncate">{category.name}</span>
      )}
      {editing ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={commit}
        >
          <Check className="size-3.5" />
        </Button>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 opacity-0 group-hover:opacity-100"
          onClick={() => setEditing(true)}
          title="Rename"
        >
          <Pencil className="size-3.5" />
        </Button>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-7 text-destructive opacity-0 group-hover:opacity-100"
        onClick={onDelete}
        title="Delete"
      >
        <X className="size-3.5" />
      </Button>
    </div>
  );
}
