"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Plus, Pencil, GripVertical } from "lucide-react";
import { toast } from "sonner";
import { usePageTitle } from "@/lib/page-context";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { api, ApiError, fetchAllPages } from "@/lib/api-client";
import {
  MasterItemDialog,
  type MasterRow,
  type MasterPageConfig,
} from "@/components/shared/master-page";

/* ── Types ── */

interface SectionDef {
  key: string;
  entityName: string;
  pluralName: string;
  path: string;
  hasColor: boolean;
  hasPoint?: boolean;
}

/* ── Sortable item within a section ── */

function SortableItem({
  item,
  def,
  onClick,
}: {
  item: MasterRow;
  def: SectionDef;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
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
      className="flex items-center gap-2 px-2 py-1.5 text-sm transition-colors hover:bg-accent/20 cursor-grab active:cursor-grabbing touch-none"
      onClick={handleClick}
      {...attributes}
      {...listeners}
    >
      <GripVertical className="size-3.5 text-muted-foreground/30 shrink-0" />
      {def.hasColor && item.color && (
        <span
          className="inline-block size-2.5 rounded-full shrink-0"
          style={{ backgroundColor: item.color as string }}
        />
      )}
      <span className="font-mono text-[10px] text-muted-foreground">{item.code}</span>
      <span className="truncate">{item.name}</span>
      {def.hasPoint && (
        <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">{(item.point as number) ?? 0}pt</span>
      )}
    </div>
  );
}

/* ── Reusable MasterSection (with DnD) ── */

function MasterSection({
  def,
  endpoint,
  items,
  onRefresh,
  extraCreatePayload,
}: {
  def: SectionDef;
  endpoint: string;
  items: MasterRow[];
  onRefresh: () => void;
  extraCreatePayload?: Record<string, unknown>;
}) {
  const [localItems, setLocalItems] = useState(items);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogItem, setDialogItem] = useState<MasterRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<MasterRow | null>(null);

  useEffect(() => { setLocalItems(items); }, [items]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const config: MasterPageConfig = {
    title: def.entityName,
    endpoint,
    entityName: def.entityName,
    hasColor: def.hasColor,
    hasPoint: def.hasPoint,
    extraCreatePayload,
  };

  const handleCreate = () => { setDialogItem(null); setDialogOpen(true); };
  const handleRowClick = (item: MasterRow) => { setDialogItem(item); setDialogOpen(true); };

  const handleItemDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = localItems.findIndex((i) => i.id === active.id);
    const newIndex = localItems.findIndex((i) => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(localItems, oldIndex, newIndex);
    setLocalItems(reordered);
    try {
      await api.patch(`${endpoint}/reorder`, { ids: reordered.map((i) => i.id) });
    } catch {
      toast.error("Failed to save order");
      setLocalItems(items);
    }
  };

  const executeDelete = async () => {
    if (!confirmDelete) return;
    try {
      await api.delete(`${endpoint}/${confirmDelete.id}`);
      toast.success(`${def.entityName} deleted`);
      setConfirmDelete(null);
      setDialogOpen(false);
      onRefresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.body.error : "Failed to delete");
    }
  };

  const handleSaved = () => {
    setDialogOpen(false);
    onRefresh();
  };

  return (
    <div className="border border-border rounded-lg">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
        <h3 className="text-sm font-semibold" style={{ color: 'hsl(var(--primary))' }}>{def.pluralName}</h3>
        <Button variant="ghost" size="icon" className="size-7" onClick={handleCreate}>
          <Plus className="size-3.5" />
        </Button>
      </div>
      <div>
        {localItems.length === 0 ? (
          <div className="px-3 py-4 text-xs text-muted-foreground text-center">Empty</div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleItemDragEnd}>
            <SortableContext items={localItems.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              {localItems.map((item) => (
                <SortableItem key={item.id} item={item} def={def} onClick={() => handleRowClick(item)} />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>

      <MasterItemDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        item={dialogItem}
        config={config}
        onSaved={() => { handleSaved(); toast.success(dialogItem ? `${def.entityName} updated` : `${def.entityName} created`); }}
        onDeleted={() => dialogItem && setConfirmDelete(dialogItem)}
      />

      <Dialog open={confirmDelete !== null} onOpenChange={(open) => { if (!open) setConfirmDelete(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{confirmDelete?.name}&quot;?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={executeDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── Sortable project section ── */

function SortableProjectSection({
  projectData,
  onRefresh,
  onEditProject,
}: {
  projectData: ProjectData;
  onRefresh: () => void;
  onEditProject: (p: MasterRow) => void;
}) {
  const { project, subjects, levels } = projectData;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: project.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div className="flex items-center gap-2 mb-2">
        <button
          type="button"
          className="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground touch-none"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{project.name}</h3>
        <button
          type="button"
          className="inline-flex size-5 items-center justify-center rounded text-muted-foreground/40 hover:text-foreground transition-colors"
          onClick={() => onEditProject(project)}
          title="Edit project"
        >
          <Pencil className="size-3" />
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <MasterSection
          def={SUBJECT_DEF}
          endpoint={`/projects/${project.id}/subjects`}
          items={subjects}
          onRefresh={onRefresh}
        />
        <MasterSection
          def={LEVEL_DEF}
          endpoint={`/projects/${project.id}/levels`}
          items={levels}
          onRefresh={onRefresh}
        />
      </div>
    </div>
  );
}

/* ── Page ── */

const STATUS_DEF: SectionDef = { key: "statuses", entityName: "Status", pluralName: "Statuses", path: "statuses", hasColor: true, hasPoint: true };
const SUBJECT_DEF: SectionDef = { key: "subjects", entityName: "Subject", pluralName: "Subjects", path: "subjects", hasColor: true };
const LEVEL_DEF: SectionDef = { key: "levels", entityName: "Level", pluralName: "Levels", path: "levels", hasColor: true };

interface ProjectData {
  project: MasterRow;
  subjects: MasterRow[];
  levels: MasterRow[];
}

export default function MastersPage() {
  usePageTitle("Masters");
  const [statuses, setStatuses] = useState<MasterRow[]>([]);
  const [projects, setProjects] = useState<MasterRow[]>([]);
  const [projectData, setProjectData] = useState<ProjectData[]>([]);
  const [loading, setLoading] = useState(true);

  // Project create/edit dialog
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [projectDialogItem, setProjectDialogItem] = useState<MasterRow | null>(null);
  const [confirmDeleteProject, setConfirmDeleteProject] = useState<MasterRow | null>(null);

  const projectConfig: MasterPageConfig = {
    title: "Project",
    endpoint: "/projects",
    entityName: "Project",
    hasColor: false,
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [sts, projs] = await Promise.all([
        fetchAllPages<MasterRow>("/statuses"),
        fetchAllPages<MasterRow>("/projects"),
      ]);
      setStatuses(sts);
      setProjects(projs);

      const pd = await Promise.all(
        projs.map(async (proj) => {
          const [subjects, levels] = await Promise.all([
            fetchAllPages<MasterRow>(`/projects/${proj.id}/subjects`),
            fetchAllPages<MasterRow>(`/projects/${proj.id}/levels`),
          ]);
          return { project: proj, subjects, levels };
        }),
      );
      setProjectData(pd);
    } catch {
      toast.error("Failed to fetch data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = projectData.findIndex((d) => d.project.id === active.id);
    const newIndex = projectData.findIndex((d) => d.project.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(projectData, oldIndex, newIndex);
    setProjectData(reordered);

    // Persist order
    try {
      await api.patch("/projects/reorder", { ids: reordered.map((d) => d.project.id) });
    } catch {
      toast.error("Failed to save order");
      fetchAll(); // revert
    }
  };

  const executeDeleteProject = async () => {
    if (!confirmDeleteProject) return;
    try {
      await api.delete(`/projects/${confirmDeleteProject.id}`);
      toast.success("Project deleted");
      setConfirmDeleteProject(null);
      setProjectDialogOpen(false);
      fetchAll();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.body.error : "Failed to delete");
    }
  };

  const handleEditProject = (p: MasterRow) => {
    setProjectDialogItem(p);
    setProjectDialogOpen(true);
  };

  return (
    <div className="p-4 md:p-6">
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : (
        <div className="space-y-6">
          {/* ── Global ── */}
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Global</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <MasterSection
                def={{ key: "projects", entityName: "Project", pluralName: "Projects", path: "projects", hasColor: true }}
                endpoint="/projects"
                items={projects}
                onRefresh={fetchAll}
              />
              <MasterSection
                def={STATUS_DEF}
                endpoint="/statuses"
                items={statuses}
                onRefresh={fetchAll}
              />
            </div>
          </div>

          {/* ── Per-project sections (sortable) ── */}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={projectData.map((d) => d.project.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-6">
                {projectData.map((pd) => (
                  <SortableProjectSection
                    key={pd.project.id}
                    projectData={pd}
                    onRefresh={fetchAll}
                    onEditProject={handleEditProject}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          {/* Add project button */}
          <button
            type="button"
            className="flex items-center gap-2 rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground hover:bg-accent/20 hover:text-foreground transition-colors w-full justify-center"
            onClick={() => { setProjectDialogItem(null); setProjectDialogOpen(true); }}
          >
            <Plus className="size-4" />
            Add Project
          </button>
        </div>
      )}

      {/* Project create/edit dialog */}
      <MasterItemDialog
        open={projectDialogOpen}
        onOpenChange={setProjectDialogOpen}
        item={projectDialogItem}
        config={projectConfig}
        onSaved={() => {
          setProjectDialogOpen(false);
          toast.success(projectDialogItem ? "Project updated" : "Project created");
          fetchAll();
        }}
        onDeleted={() => projectDialogItem && setConfirmDeleteProject(projectDialogItem)}
      />

      <Dialog open={confirmDeleteProject !== null} onOpenChange={(open) => { if (!open) setConfirmDeleteProject(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete project &quot;{confirmDeleteProject?.name}&quot;?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeleteProject(null)}>Cancel</Button>
            <Button variant="destructive" onClick={executeDeleteProject}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
