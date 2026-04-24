"use client";

import { useState, useEffect, useRef } from "react";
import { Trash2, GripVertical, Plus } from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Fab } from "@/components/shared/fab";
import { usePageTitle } from "@/lib/page-context";
import { randomCode } from "@/lib/utils";

/**
 * Generic master item row — the minimum shape MasterListUI needs to render.
 * Entity-specific hooks (e.g. useTags) cast their rows to this type.
 */
export interface MasterItem {
  id: string;
  code: string;
  name: string;
  color?: string | null;
  point?: number;
}

/** Flat payload produced by the item dialog; callers map to RPC JSON. */
export interface MasterSavePayload {
  code: string;
  name: string;
  color?: string | null;
  point?: number;
}

interface SharedProps<T extends MasterItem> {
  items: T[];
  loading: boolean;
  entityName: string;
  hasColor?: boolean;
  hasPoint?: boolean;
  onCreate: (payload: MasterSavePayload) => Promise<unknown>;
  onUpdate: (id: string, payload: MasterSavePayload) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
  onReorder: (ids: string[]) => Promise<unknown> | unknown;
}

const COLOR_PRESETS = [
  "#EF4444", "#F97316", "#EAB308", "#22C55E",
  "#14B8A6", "#3B82F6", "#8B5CF6", "#EC4899",
];

// ── Item dialog ──

function MasterItemDialog<T extends MasterItem>({
  open,
  onOpenChange,
  item,
  entityName,
  hasColor,
  hasPoint,
  onSubmit,
  onRequestDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: T | null;
  entityName: string;
  hasColor?: boolean;
  hasPoint?: boolean;
  onSubmit: (payload: MasterSavePayload) => Promise<void>;
  onRequestDelete: () => void;
}) {
  const isCreate = item === null;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [color, setColor] = useState<string | null>(null);
  const [hexInput, setHexInput] = useState("");
  const [point, setPoint] = useState(0);

  useEffect(() => {
    if (!open) { setError(null); return; }
    if (item) {
      setCode(item.code);
      setName(item.name);
      const c = item.color ?? null;
      setColor(c);
      setHexInput(c ?? "");
      setPoint(item.point ?? 0);
    } else {
      setCode(""); setName(""); setColor(null); setHexInput(""); setPoint(0);
    }
  }, [open, item]);

  const handleSubmit = async () => {
    setError(null);
    if (!name.trim()) { setError("Name is required"); return; }
    setSaving(true);
    try {
      const payload: MasterSavePayload = { code: code.trim() || randomCode(), name: name.trim() };
      if (hasColor) payload.color = color;
      if (hasPoint) payload.point = point;
      await onSubmit(payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isCreate ? `New ${entityName}` : `Edit ${entityName}`}</DialogTitle>
          <DialogDescription className="sr-only">{isCreate ? `Create a new ${entityName}` : `Edit ${entityName}`}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Code</Label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Auto-generated if empty" className="font-mono" />
          </div>
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Name" />
          </div>
          {hasColor && (
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-1.5">
                {COLOR_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className={`w-7 h-7 rounded-md border-2 transition-all ${
                      color === preset ? "border-foreground scale-110" : "border-transparent hover:border-muted-foreground/50"
                    }`}
                    style={{ backgroundColor: preset }}
                    onClick={() => { setColor(preset); setHexInput(preset); }}
                  />
                ))}
                <button
                  type="button"
                  className={`w-7 h-7 rounded-md border-2 transition-all flex items-center justify-center text-xs text-muted-foreground ${
                    color === null ? "border-foreground" : "border-dashed border-muted-foreground/50 hover:border-muted-foreground"
                  }`}
                  onClick={() => { setColor(null); setHexInput(""); }}
                  title="Clear color"
                >
                  ×
                </button>
              </div>
              <Input
                value={hexInput}
                onChange={(e) => {
                  const v = e.target.value;
                  setHexInput(v);
                  if (/^#[0-9a-fA-F]{6}$/.test(v)) setColor(v);
                }}
                placeholder="#FF5733"
                className="font-mono text-xs w-32"
              />
            </div>
          )}
          {hasPoint && (
            <div className="space-y-2">
              <Label>Point</Label>
              <Input
                type="number"
                value={point}
                onChange={(e) => setPoint(Number(e.target.value))}
                className="w-24 font-mono"
              />
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          {!isCreate && (
            <Button variant="outline" size="sm" className="text-destructive hover:text-destructive mr-auto" onClick={onRequestDelete}>
              <Trash2 className="h-3.5 w-3.5 mr-1" />Delete
            </Button>
          )}
          {isCreate && <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>}
          <Button onClick={handleSubmit} disabled={saving}>{saving ? "Saving..." : isCreate ? "Create" : "Update"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Sortable row ──

function SortableRow<T extends MasterItem>({
  item, hasColor, onClick,
}: { item: T; hasColor?: boolean; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const didDrag = useRef(false);
  useEffect(() => { if (isDragging) didDrag.current = true; }, [isDragging]);
  const handleClick = () => {
    if (didDrag.current) { didDrag.current = false; return; }
    onClick();
  };
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 px-3 py-2 text-sm border-b border-border/30 transition-colors hover:bg-accent/20 cursor-grab active:cursor-grabbing touch-none"
      onClick={handleClick}
      {...attributes}
      {...listeners}
    >
      <GripVertical className="size-3.5 text-muted-foreground/30 shrink-0" />
      {hasColor && item.color && (
        <span className="inline-block size-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
      )}
      <span className="font-mono text-xs text-muted-foreground">{item.code}</span>
      <span className="truncate">{item.name}</span>
    </div>
  );
}

// ── Shared controller hook ──

function useMasterController<T extends MasterItem>(props: SharedProps<T>) {
  const { items, entityName, onCreate, onUpdate, onDelete, onReorder } = props;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogItem, setDialogItem] = useState<T | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<T | null>(null);

  const openCreate = () => { setDialogItem(null); setDialogOpen(true); };
  const openEdit = (item: T) => { setDialogItem(item); setDialogOpen(true); };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(items, oldIndex, newIndex);
    await onReorder(reordered.map((i) => i.id));
  };

  const executeDelete = async () => {
    if (!confirmDelete) return;
    try {
      await onDelete(confirmDelete.id);
      setConfirmDelete(null);
      setDialogOpen(false);
    } catch {
      // surfaced via entity hooks' onError toast
    }
  };

  const handleSubmit = async (payload: MasterSavePayload) => {
    if (dialogItem) {
      await onUpdate(dialogItem.id, payload);
    } else {
      await onCreate(payload);
    }
    setDialogOpen(false);
  };

  return {
    dialogOpen, setDialogOpen,
    dialogItem,
    confirmDelete, setConfirmDelete,
    openCreate, openEdit,
    handleDragEnd, executeDelete, handleSubmit,
  };
}

function useDndSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
}

// ── Embeddable: list with dialog, no page chrome (used in masters aggregate) ──

export function MasterList<T extends MasterItem>(props: SharedProps<T> & { title: string }) {
  const sensors = useDndSensors();
  const ctl = useMasterController(props);
  return (
    <div className="border border-border rounded-lg">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
        <h3 className="text-sm font-semibold" style={{ color: "hsl(var(--primary))" }}>{props.title}</h3>
        <Button variant="ghost" size="icon" className="size-7" onClick={ctl.openCreate}>
          <Plus className="size-3.5" />
        </Button>
      </div>
      {props.loading ? (
        <div className="px-3 py-4 text-xs text-muted-foreground text-center">Loading...</div>
      ) : props.items.length === 0 ? (
        <div className="px-3 py-4 text-xs text-muted-foreground text-center">Empty</div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={ctl.handleDragEnd}>
          <SortableContext items={props.items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            {props.items.map((item) => (
              <SortableRow key={item.id} item={item} hasColor={props.hasColor} onClick={() => ctl.openEdit(item)} />
            ))}
          </SortableContext>
        </DndContext>
      )}
      <MasterItemDialog
        open={ctl.dialogOpen}
        onOpenChange={ctl.setDialogOpen}
        item={ctl.dialogItem}
        entityName={props.entityName}
        hasColor={props.hasColor}
        hasPoint={props.hasPoint}
        onSubmit={ctl.handleSubmit}
        onRequestDelete={() => ctl.dialogItem && ctl.setConfirmDelete(ctl.dialogItem)}
      />
      <Dialog open={ctl.confirmDelete !== null} onOpenChange={(open) => { if (!open) ctl.setConfirmDelete(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{ctl.confirmDelete?.name}&quot;?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => ctl.setConfirmDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={ctl.executeDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Full page: page title, table layout, Fab ──

export function MasterPageUI<T extends MasterItem>(props: SharedProps<T> & { title: string }) {
  usePageTitle(props.title);
  const sensors = useDndSensors();
  const ctl = useMasterController(props);
  return (
    <div className="p-4 md:p-6">
      {props.loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : props.items.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">No {props.entityName} found</div>
      ) : (
        <div className="border border-border rounded-md overflow-hidden">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={ctl.handleDragEnd}>
            <SortableContext items={props.items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              {props.items.map((item) => (
                <SortableRow key={item.id} item={item} hasColor={props.hasColor} onClick={() => ctl.openEdit(item)} />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      )}
      <Fab onClick={ctl.openCreate} />
      <MasterItemDialog
        open={ctl.dialogOpen}
        onOpenChange={ctl.setDialogOpen}
        item={ctl.dialogItem}
        entityName={props.entityName}
        hasColor={props.hasColor}
        hasPoint={props.hasPoint}
        onSubmit={ctl.handleSubmit}
        onRequestDelete={() => ctl.dialogItem && ctl.setConfirmDelete(ctl.dialogItem)}
      />
      <Dialog open={ctl.confirmDelete !== null} onOpenChange={(open) => { if (!open) ctl.setConfirmDelete(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{ctl.confirmDelete?.name}&quot;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => ctl.setConfirmDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={ctl.executeDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
