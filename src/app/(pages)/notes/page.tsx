"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Pin,
  Trash2,
  FileText,
  LayoutGrid,
  GripVertical,
} from "lucide-react";
import { toast } from "sonner";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ApiError } from "@/lib/api-client";
import { useProject } from "@/hooks/use-project";
import {
  useNotesList,
  useCreateNote,
  useUpdateNote,
  useDeleteNote,
  useReorderNotes,
  type NoteRow,
} from "@/hooks/queries/use-notes";
import { usePageTitle, usePageContext } from "@/lib/page-context";
import { MarkdownEditor } from "@/components/markdown-editor";
import { Fab } from "@/components/shared/fab";
import { cn } from "@/lib/utils";

type NotesTab = "notes" | "masters";

/* ── Sortable note row ── */

function SortableNoteRow({
  note: n,
  selected,
  onClick,
}: {
  note: NoteRow;
  selected: boolean;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: n.id });
  const didDrag = useRef(false);

  useEffect(() => {
    if (isDragging) didDrag.current = true;
  }, [isDragging]);

  const handleClick = () => {
    if (didDrag.current) { didDrag.current = false; return; }
    onClick();
  };

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2 px-3 py-2 text-sm border-b border-border/30 transition-colors hover:bg-accent/20 cursor-grab active:cursor-grabbing touch-none",
        selected && "bg-sidebar-accent text-primary",
      )}
      onClick={handleClick}
      {...attributes}
      {...listeners}
    >
      <GripVertical className="size-3.5 text-muted-foreground/30 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {n.pinned && <Pin className="size-3 text-primary shrink-0" />}
          <span className="truncate font-medium">{n.title}</span>
        </div>
        <p className="text-xs text-muted-foreground truncate mt-0.5">
          {n.content.slice(0, 60) || "(empty)"}
        </p>
      </div>
    </div>
  );
}

/* ── Page ── */

export default function NotesPage() {
  usePageTitle("Notes");
  const { currentProject } = useProject();

  const [tab, setTab] = useState<NotesTab>("notes");
  const { data: notes = [], isLoading: loading } = useNotesList(currentProject?.id);
  const createNote = useCreateNote(currentProject?.id);
  const updateNote = useUpdateNote(currentProject?.id);
  const deleteNote = useDeleteNote(currentProject?.id);
  const reorderNotes = useReorderNotes(currentProject?.id);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const contentRef = useRef("");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastScrollTop = useRef(0);
  const scrollCooldown = useRef(false);
  const flushSaveRef = useRef<() => void>(() => {});
  const deleteRef = useRef<(id: string) => void>(() => {});
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const { setHeaderSlot, scrollingDown, setScrollingDown } = usePageContext();

  const selectedNote = notes.find((n) => n.id === selectedId) ?? null;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleNoteDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = notes.findIndex((n) => n.id === active.id);
    const newIndex = notes.findIndex((n) => n.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(notes, oldIndex, newIndex);
    reorderNotes.mutate(reordered.map((n) => n.id), {
      onError: () => toast.error("Failed to save order"),
    });
  };

  /* ── Auto-save on note switch / unmount ── */

  const saveNote = useCallback(
    (noteId: string, title: string, content: string) => {
      updateNote.mutate({
        id: noteId,
        payload: { title: title.trim() || "Untitled", content },
      });
    },
    [updateNote],
  );

  const flushSave = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (selectedId) {
      saveNote(selectedId, editTitle, contentRef.current);
    }
  }, [selectedId, editTitle, saveNote]);

  flushSaveRef.current = flushSave;

  // Inject title controls + tab buttons into the layout header
  useEffect(() => {
    setHeaderSlot(
      <div className="flex items-center gap-2">
        {/* Left: title + delete (only when editing a note) */}
        {tab === "notes" && selectedNote ? (
          <div className="flex items-center gap-1 min-w-0 flex-1">
            <Input
              value={editTitle}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditTitle(e.target.value)}
              onBlur={() => flushSaveRef.current()}
              placeholder="Title"
              className="h-8 max-w-xs text-sm font-semibold"
            />
            <Button
              size="sm"
              variant="ghost"
              className="size-8 p-0 text-destructive hover:text-destructive shrink-0"
              onClick={() => { if (selectedId) setConfirmDeleteId(selectedId); }}
              title="Delete"
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ) : (
          <div className="flex-1" />
        )}
        {/* Right: tabs */}
        <div className="inline-flex items-center rounded-lg border border-border bg-muted/30 p-0.5 shrink-0">
          {([
            { key: "notes" as const, label: "Notes", icon: FileText },
            { key: "masters" as const, label: "Masters", icon: LayoutGrid },
          ]).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                if (key === tab) return;
                if (tab === "notes") flushSaveRef.current();
                setTab(key);
              }}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                tab === key
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>,
    );
    return () => setHeaderSlot(null);
  }, [tab, selectedNote, selectedId, editTitle, setHeaderSlot]);

  function handleEditorScroll(e: React.UIEvent<HTMLDivElement>) {
    if (scrollCooldown.current) return;
    const st = e.currentTarget.scrollTop;
    const delta = st - lastScrollTop.current;
    if (Math.abs(delta) < 8) return;
    const down = delta > 0 && st > 10;
    if (down !== scrollingDown) {
      setScrollingDown(down);
      scrollCooldown.current = true;
      setTimeout(() => { scrollCooldown.current = false; }, 300);
    }
    lastScrollTop.current = st;
  }

  // Save before switching notes
  function selectNote(id: string) {
    if (selectedId && selectedId !== id) {
      flushSave();
    }
    const note = notes.find((n) => n.id === id);
    if (note) {
      setSelectedId(id);
      setEditTitle(note.title);
      contentRef.current = note.content;
    }
  }

  // Debounced auto-save on content change
  function handleContentChange(markdown: string) {
    contentRef.current = markdown;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      if (selectedId) {
        saveNote(selectedId, editTitle, contentRef.current);
      }
    }, 2000);
  }

  /* ── Handlers ── */

  const handleCreate = () => {
    if (!currentProject) return;
    createNote.mutate(
      { title: "Untitled", content: "" },
      {
        onSuccess: (res) => {
          setSelectedId(res.data.id);
          setEditTitle(res.data.title);
          contentRef.current = res.data.content;
        },
        onError: (e) =>
          toast.error(e instanceof ApiError ? e.body?.error : "Failed to create"),
      },
    );
  };

  const handleDelete = (id: string) => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    deleteNote.mutate(id, {
      onSuccess: () => {
        toast.success("Deleted");
        if (selectedId === id) {
          setSelectedId(null);
        }
      },
      onError: (e) =>
        toast.error(e instanceof ApiError ? e.body?.error : "Failed to delete"),
    });
  };

  deleteRef.current = handleDelete;

  if (!currentProject) {
    return (
      <div className="p-4 md:p-6">
        <div className="text-center py-12 text-muted-foreground">
          Please select a project
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Notes view */}
      <div className={cn("flex flex-col min-h-0", tab === "notes" && selectedNote ? "flex-1" : "hidden")}>
      {selectedNote && (
        <div className="flex-1 overflow-y-auto" onScroll={handleEditorScroll}>
          <div className="mx-auto max-w-3xl p-4">
            <MarkdownEditor
              key={selectedNote.id}
              defaultValue={selectedNote.content}
              onChange={handleContentChange}
            />
          </div>
        </div>
      )}
      </div>

      {/* Masters view — shown when Masters tab active OR no note selected */}
      <div className={cn("overflow-y-auto p-4 md:p-6", (tab === "masters" || !selectedNote) ? "flex-1" : "hidden")}>
        <div className="max-w-3xl mx-auto">
          <div className="border border-border rounded-lg">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
              <h3 className="text-sm font-semibold" style={{ color: 'hsl(var(--primary))' }}>Notes</h3>
            </div>
            {loading ? (
              <div className="px-3 py-4 text-xs text-muted-foreground text-center">Loading...</div>
            ) : notes.length === 0 ? (
              <div className="px-3 py-4 text-xs text-muted-foreground text-center">No notes</div>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleNoteDragEnd}>
                <SortableContext items={notes.map((n) => n.id)} strategy={verticalListSortingStrategy}>
                  {notes.map((n) => (
                    <SortableNoteRow
                      key={n.id}
                      note={n}
                      selected={selectedId === n.id}
                      onClick={() => { selectNote(n.id); setScrollingDown(false); setTab("notes"); }}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            )}
          </div>
        </div>
      </div>

      <Fab onClick={handleCreate} />

      {/* Delete confirmation dialog */}
      <Dialog open={!!confirmDeleteId} onOpenChange={(open) => { if (!open) setConfirmDeleteId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete note</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Are you sure you want to delete this note? This action cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeleteId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (confirmDeleteId) deleteRef.current(confirmDeleteId);
                setConfirmDeleteId(null);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
