"use client";

import { useState } from "react";
import { Plus, Pencil, GripVertical } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api-client";
import { usePageTitle } from "@/lib/page-context";
import { randomCode } from "@/lib/utils";
import { MasterList, type MasterSavePayload } from "@/components/shared/master-list-ui";
import {
  useProjects,
  useReorderProjects,
  useCreateProject,
  useUpdateProject,
  useDeleteProject,
  type Project,
} from "@/hooks/queries/use-project-data";
import {
  useStatusesList,
  useCreateStatus,
  useUpdateStatus,
  useDeleteStatus,
  useReorderStatuses,
} from "@/hooks/queries/use-statuses";
import {
  useSubjectsList,
  useCreateSubject,
  useUpdateSubject,
  useDeleteSubject,
  useReorderSubjects,
} from "@/hooks/queries/use-subjects";
import {
  useLevelsList,
  useCreateLevel,
  useUpdateLevel,
  useDeleteLevel,
  useReorderLevels,
} from "@/hooks/queries/use-levels";

/* ── Statuses (global) ── */

function StatusesSection() {
  const { data: statuses = [], isLoading } = useStatusesList();
  const create = useCreateStatus();
  const update = useUpdateStatus();
  const remove = useDeleteStatus();
  const reorder = useReorderStatuses();
  return (
    <MasterList
      title="Statuses"
      entityName="Status"
      hasColor
      items={statuses}
      loading={isLoading}
      onCreate={(p: MasterSavePayload) =>
        create.mutateAsync({ code: p.code, name: p.name, color: p.color ?? null })
      }
      onUpdate={(id, p: MasterSavePayload) =>
        update.mutateAsync({ id, payload: { code: p.code, name: p.name, color: p.color ?? null } })
      }
      onDelete={(id) => remove.mutateAsync(id)}
      onReorder={(ids) => reorder.mutateAsync(ids)}
    />
  );
}

/* ── Per-project subjects/levels ── */

function SubjectsSection({ projectId }: { projectId: string }) {
  const { data: subjects = [], isLoading } = useSubjectsList(projectId);
  const create = useCreateSubject(projectId);
  const update = useUpdateSubject(projectId);
  const remove = useDeleteSubject(projectId);
  const reorder = useReorderSubjects(projectId);
  return (
    <MasterList
      title="Subjects"
      entityName="Subject"
      hasColor
      items={subjects}
      loading={isLoading}
      onCreate={(p: MasterSavePayload) =>
        create.mutateAsync({ code: p.code, name: p.name, color: p.color ?? null })
      }
      onUpdate={(id, p: MasterSavePayload) =>
        update.mutateAsync({ id, payload: { code: p.code, name: p.name, color: p.color ?? null } })
      }
      onDelete={(id) => remove.mutateAsync(id)}
      onReorder={(ids) => reorder.mutateAsync(ids)}
    />
  );
}

function LevelsSection({ projectId }: { projectId: string }) {
  const { data: levels = [], isLoading } = useLevelsList(projectId);
  const create = useCreateLevel(projectId);
  const update = useUpdateLevel(projectId);
  const remove = useDeleteLevel(projectId);
  const reorder = useReorderLevels(projectId);
  return (
    <MasterList
      title="Levels"
      entityName="Level"
      hasColor
      items={levels}
      loading={isLoading}
      onCreate={(p: MasterSavePayload) =>
        create.mutateAsync({ code: p.code, name: p.name, color: p.color ?? null })
      }
      onUpdate={(id, p: MasterSavePayload) =>
        update.mutateAsync({ id, payload: { code: p.code, name: p.name, color: p.color ?? null } })
      }
      onDelete={(id) => remove.mutateAsync(id)}
      onReorder={(ids) => reorder.mutateAsync(ids)}
    />
  );
}

/* ── Sortable project section ── */

function SortableProjectSection({
  project,
  onEditProject,
}: {
  project: Project;
  onEditProject: (p: Project) => void;
}) {
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
        <SubjectsSection projectId={project.id} />
        <LevelsSection projectId={project.id} />
      </div>
    </div>
  );
}

/* ── Project create/edit dialog (minimal, since project has no color/point here) ── */

function ProjectDialog({
  open,
  onOpenChange,
  item,
  onSave,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  item: Project | null;
  onSave: (payload: { code: string; name: string }) => Promise<void>;
  onDelete: () => void;
}) {
  const isCreate = item === null;
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when dialog opens
  if (open && !saving) {
    // noop — React will call effect next tick; we use uncontrolled defaults below
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (o) {
          setCode(item?.code ?? "");
          setName(item?.name ?? "");
          setError(null);
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isCreate ? "New Project" : "Edit Project"}</DialogTitle>
          <DialogDescription className="sr-only">Project details</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Code</Label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Auto-generated if empty" className="font-mono" />
          </div>
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Project name" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          {!isCreate && (
            <Button variant="outline" size="sm" className="text-destructive hover:text-destructive mr-auto" onClick={onDelete}>
              Delete
            </Button>
          )}
          <DialogClose asChild>
            <Button variant="outline" disabled={saving}>Cancel</Button>
          </DialogClose>
          <Button
            onClick={async () => {
              if (!name.trim()) { setError("Name is required"); return; }
              setSaving(true);
              try {
                await onSave({ code: code.trim() || randomCode(), name: name.trim() });
              } catch (e) {
                setError(e instanceof Error ? e.message : "Failed to save");
              } finally {
                setSaving(false);
              }
            }}
            disabled={saving}
          >
            {saving ? "Saving..." : isCreate ? "Create" : "Update"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Page ── */

export default function MastersPage() {
  usePageTitle("Masters");
  const { data: projects = [], isLoading } = useProjects();
  const reorderProjects = useReorderProjects();
  const createProject = useCreateProject();
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();

  // Project create/edit dialog
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [projectDialogItem, setProjectDialogItem] = useState<Project | null>(null);
  const [confirmDeleteProject, setConfirmDeleteProject] = useState<Project | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = projects.findIndex((p) => p.id === active.id);
    const newIndex = projects.findIndex((p) => p.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(projects, oldIndex, newIndex);
    reorderProjects.mutate(reordered.map((p) => p.id), {
      onError: () => toast.error("Failed to save order"),
    });
  };

  const executeDeleteProject = () => {
    if (!confirmDeleteProject) return;
    deleteProject.mutate(confirmDeleteProject.id, {
      onSuccess: () => {
        toast.success("Project deleted");
        setConfirmDeleteProject(null);
        setProjectDialogOpen(false);
      },
      onError: (e) => toast.error(e instanceof ApiError ? e.body.error : "Failed to delete"),
    });
  };

  const handleSaveProject = async (payload: { code: string; name: string }) => {
    if (projectDialogItem) {
      await updateProject.mutateAsync({ id: projectDialogItem.id, payload });
      toast.success("Project updated");
    } else {
      await createProject.mutateAsync(payload);
      toast.success("Project created");
    }
    setProjectDialogOpen(false);
  };

  return (
    <div className="p-4 md:p-6">
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : (
        <div className="space-y-6">
          {/* Global section */}
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Global</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <StatusesSection />
            </div>
          </div>

          {/* Per-project sections (sortable) */}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={projects.map((p) => p.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-6">
                {projects.map((project) => (
                  <SortableProjectSection
                    key={project.id}
                    project={project}
                    onEditProject={(p) => { setProjectDialogItem(p); setProjectDialogOpen(true); }}
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

      <ProjectDialog
        open={projectDialogOpen}
        onOpenChange={setProjectDialogOpen}
        item={projectDialogItem}
        onSave={handleSaveProject}
        onDelete={() => projectDialogItem && setConfirmDeleteProject(projectDialogItem)}
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
