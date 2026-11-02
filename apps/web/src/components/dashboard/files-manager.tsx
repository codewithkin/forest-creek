"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronRight,
  CloudOff,
  CloudUpload,
  Download,
  Folder,
  FolderInput,
  FolderOpen,
  FolderPlus,
  HardDrive,
  Inbox,
  LayoutGrid,
  List,
  Pencil,
  RotateCcw,
  Trash2,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { buttonClass } from "@/components/brand/button";
import { Spinner } from "@/components/brand/spinner";
import { ErrorMessage, friendlyError, StateMessage } from "@/components/brand/state";
import { trpc } from "@/utils/trpc";

import { FileDrawer, type FileRow } from "./file-drawer";
import { filesFromDrop, type PickedFile } from "./pick-files";
import { useProperties } from "./property-context";
import { BulkBar, type BulkAction } from "./ui/bulk-bar";
import { Checkbox, DataTable, type Column } from "./ui/data-table";
import { Modal } from "./ui/overlay";
import { FilterPills, PageHeader, SearchInput, StatTile } from "./ui/page";
import { FileTypeIcon, formatBytes } from "./ui/upload";
import { UploadModal } from "./upload-modal";

const kinds = [
  { key: "all", label: "All files" },
  { key: "documents", label: "Documents" },
  { key: "images", label: "Images" },
  { key: "video", label: "Video" },
  { key: "trash", label: "Trash" },
] as const;

type Kind = (typeof kinds)[number]["key"];

type FolderRow = { id: string; name: string; propertyId: string | null; createdAt: string; _count: { files: number; children: number } };

/** Folders and files in one list. Keys are "d:<id>" for a folder and "f:<id>" for a file. */
type Item = { key: string; kind: "folder"; folder: FolderRow } | { key: string; kind: "file"; file: FileRow };

const DRAG_TYPE = "application/x-forest-creek-items";

function day(value: string): string {
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const split = (keys: Iterable<string>) => {
  const fileIds: string[] = [];
  const folderIds: string[] = [];
  for (const key of keys) (key.startsWith("d:") ? folderIds : fileIds).push(key.slice(2));
  return { fileIds, folderIds };
};

/** A zip of files and folders, from the web's download route (folders stay folders). */
function downloadZip(fileIds: string[], folderIds: string[], name: string) {
  const query = new URLSearchParams();
  if (fileIds.length) query.set("files", fileIds.join(","));
  if (folderIds.length) query.set("folders", folderIds.join(","));
  query.set("name", name);
  window.location.assign(`/dashboard/files/download?${query}`);
}

export default function FilesManager() {
  const { selectedId, selected: property } = useProperties();
  const [kind, setKind] = useState<Kind>("all");
  const [typed, setTyped] = useState("");
  const [search, setSearch] = useState("");
  const [folderId, setFolderId] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "grid">("list");
  const [openId, setOpenId] = useState<string>();
  const [uploading, setUploading] = useState<{ initial?: PickedFile[] }>();
  const [naming, setNaming] = useState<{ renaming?: FolderRow }>();
  const [moving, setMoving] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [dropTarget, setDropTarget] = useState<string | null | undefined>();
  const [fileDragOver, setFileDragOver] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    const timer = setTimeout(() => setSearch(typed.trim()), 250);
    return () => clearTimeout(timer);
  }, [typed]);

  // A property changing means a different tree; any change of view clears the selection.
  useEffect(() => setFolderId(null), [selectedId]);
  useEffect(() => setPicked(new Set()), [selectedId, folderId, kind, search]);

  const status = useQuery(trpc.files.status.queryOptions());
  const trash = kind === "trash";
  const browsing = !search && !trash && kind === "all";
  const files = useQuery(
    trpc.files.list.queryOptions({ folderId: browsing ? folderId : undefined, propertyId: selectedId, search: search || undefined, kind }),
  );
  const folders = useQuery({ ...trpc.files.folders.queryOptions({ parentId: folderId, propertyId: selectedId }), enabled: browsing });
  const path = useQuery({ ...trpc.files.folderPath.queryOptions(folderId ?? ""), enabled: Boolean(folderId) });

  const items = useMemo<Item[] | undefined>(() => {
    if (files.isPending || (browsing && folders.isPending)) return undefined;
    const folderItems: Item[] = browsing ? ((folders.data ?? []) as FolderRow[]).map((folder) => ({ key: `d:${folder.id}`, kind: "folder", folder })) : [];
    const fileItems: Item[] = ((files.data ?? []) as FileRow[]).map((file) => ({ key: `f:${file.id}`, kind: "file", file }));
    return [...folderItems, ...fileItems];
  }, [browsing, files.data, files.isPending, folders.data, folders.isPending]);

  const done = (message: string) => async () => {
    toast.success(message);
    setPicked(new Set());
    await queryClient.invalidateQueries({ queryKey: trpc.files.pathKey() });
  };
  const failed = (error: { message?: string }) => toast.error(friendlyError(error));

  const move = useMutation(trpc.files.move.mutationOptions({ onError: failed }));
  const trashMany = useMutation(trpc.files.trashMany.mutationOptions({ onError: failed }));
  const restoreMany = useMutation(trpc.files.restoreMany.mutationOptions({ onError: failed }));
  const deleteForever = useMutation(trpc.files.deleteForever.mutationOptions({ onError: failed }));
  const link = useMutation(trpc.files.link.mutationOptions({ onError: failed }));

  async function moveTo(keys: string[], to: string | null) {
    const { fileIds, folderIds } = split(keys);
    const { moved } = await move.mutateAsync({ fileIds, folderIds: folderIds.filter((id) => id !== to), to });
    await done(`Moved ${moved} ${moved === 1 ? "item" : "items"}`)();
  }

  async function download(keys: string[]) {
    const { fileIds, folderIds } = split(keys);
    // One file is a plain download; anything more, or a folder, comes as a zip.
    if (fileIds.length === 1 && folderIds.length === 0) {
      const { url } = await link.mutateAsync({ id: fileIds[0]!, preview: false });
      window.location.assign(url);
      return;
    }
    const only = items?.find((item) => item.kind === "folder" && folderIds.length === 1 && fileIds.length === 0 && item.folder.id === folderIds[0]);
    downloadZip(fileIds, folderIds, only?.kind === "folder" ? only.folder.name : "Forest Creek files");
  }

  /* ---- Drag and drop: rows onto folders, and files from the computer onto the page ---- */

  const dragKeys = (item: Item) => (picked.has(item.key) ? [...picked] : [item.key]);

  const dragSource = (item: Item) =>
    trash
      ? {}
      : {
          draggable: true,
          onDragStart: (event: React.DragEvent) => {
            const keys = dragKeys(item);
            event.dataTransfer.setData(DRAG_TYPE, JSON.stringify(keys));
            event.dataTransfer.effectAllowed = "move";
          },
          onDragEnd: () => setDropTarget(undefined),
        };

  const dropZone = (to: string | null) => ({
    onDragOver: (event: React.DragEvent) => {
      if (!event.dataTransfer.types.includes(DRAG_TYPE)) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "move";
      setDropTarget(to);
    },
    onDragLeave: () => setDropTarget((current) => (current === to ? undefined : current)),
    onDrop: (event: React.DragEvent) => {
      const raw = event.dataTransfer.getData(DRAG_TYPE);
      if (!raw) return;
      event.preventDefault();
      event.stopPropagation();
      setDropTarget(undefined);
      const keys = (JSON.parse(raw) as string[]).filter((key) => key !== `d:${to}`);
      if (keys.length) void moveTo(keys, to);
    },
  });

  const pageDrop = {
    onDragOver: (event: React.DragEvent) => {
      if (trash || !event.dataTransfer.types.includes("Files")) return;
      event.preventDefault();
      setFileDragOver(true);
    },
    onDragLeave: (event: React.DragEvent) => {
      if (event.currentTarget === event.target) setFileDragOver(false);
    },
    onDrop: (event: React.DragEvent) => {
      if (trash || !event.dataTransfer.types.includes("Files")) return;
      event.preventDefault();
      setFileDragOver(false);
      void filesFromDrop(event.dataTransfer).then((dropped) => dropped.length && setUploading({ initial: dropped }));
    },
  };

  /* ---- The selection's actions ---- */

  const { fileIds: pickedFiles, folderIds: pickedFolders } = split(picked);
  const onlyFolder = pickedFolders.length === 1 && pickedFiles.length === 0 ? (items?.find((item) => item.key === `d:${pickedFolders[0]}`) as Extract<Item, { kind: "folder" }> | undefined) : undefined;

  const actions: BulkAction[] = trash
    ? [
        { key: "restore", label: "Restore", icon: RotateCcw, onClick: () => restoreMany.mutateAsync(pickedFiles).then(({ restored }) => done(`Restored ${restored}`)()) },
        {
          key: "forever",
          label: "Delete forever",
          icon: Trash2,
          danger: true,
          confirm: "Delete for good? This can't be undone.",
          onClick: () =>
            deleteForever.mutateAsync({ ids: pickedFiles }).then(({ deleted, failed: missed }) => done(missed ? `Deleted ${deleted}; ${missed} couldn't be removed, try again` : `Deleted ${deleted} for good`)()),
        },
      ]
    : [
        { key: "download", label: "Download", icon: Download, onClick: () => download([...picked]) },
        { key: "move", label: "Move to…", icon: FolderInput, onClick: () => setMoving(true) },
        ...(onlyFolder ? [{ key: "rename", label: "Rename", icon: Pencil, onClick: () => setNaming({ renaming: onlyFolder.folder }) }] : []),
        {
          key: "trash",
          label: "Delete",
          icon: Trash2,
          danger: true,
          confirm: pickedFolders.length ? "Delete, with everything in the folders? (Files wait 30 days in the trash.)" : undefined,
          onClick: () => trashMany.mutateAsync({ fileIds: pickedFiles, folderIds: pickedFolders }).then(({ trashed }) => done(`${trashed} ${trashed === 1 ? "file" : "files"} moved to the trash`)()),
        },
      ];

  const nameCell = (item: Item) =>
    item.kind === "folder" ? (
      <span className="flex min-w-0 items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent/15">
          {dropTarget === item.folder.id ? <FolderOpen className="size-5 text-accent" aria-hidden /> : <Folder className="size-5 text-accent" aria-hidden />}
        </span>
        <span className="min-w-0">
          <span className="block max-w-[14rem] truncate font-medium sm:max-w-sm">{item.folder.name}</span>
          <span className="block text-xs text-muted-foreground">
            {item.folder._count.files} {item.folder._count.files === 1 ? "file" : "files"}
            {item.folder._count.children ? `, ${item.folder._count.children} ${item.folder._count.children === 1 ? "folder" : "folders"}` : ""}
          </span>
        </span>
      </span>
    ) : (
      <span className="flex min-w-0 items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary">
          <FileTypeIcon type={item.file.contentType} />
        </span>
        <span className="min-w-0">
          <span className="block max-w-[14rem] truncate sm:max-w-sm">{item.file.name}</span>
          {item.file.description && <span className="block max-w-[14rem] truncate text-xs text-muted-foreground sm:max-w-sm">{item.file.description}</span>}
        </span>
      </span>
    );

  const columns: Column<Item>[] = [
    {
      key: "name",
      header: "Name",
      // Folders stay above files whichever way the names sort.
      sortValue: (item) => (item.kind === "folder" ? `0${item.folder.name.toLowerCase()}` : `1${item.file.name.toLowerCase()}`),
      render: nameCell,
    },
    {
      key: "size",
      header: "Size",
      hideBelow: "sm",
      sortValue: (item) => (item.kind === "file" ? item.file.sizeBytes : -1),
      render: (item) => <span className="whitespace-nowrap text-muted-foreground">{item.kind === "file" ? formatBytes(item.file.sizeBytes) : "—"}</span>,
    },
    { key: "by", header: "Uploaded by", hideBelow: "lg", render: (item) => <span className="text-muted-foreground">{item.kind === "file" ? item.file.uploadedBy : ""}</span> },
    {
      key: "date",
      header: trash ? "Deleted" : "Added",
      align: "right",
      hideBelow: "md",
      sortValue: (item) => (item.kind === "file" ? (trash ? (item.file.deletedAt ?? "") : item.file.createdAt) : item.folder.createdAt),
      render: (item) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {item.kind === "file" ? day(trash ? (item.file.deletedAt ?? item.file.createdAt) : item.file.createdAt) : day(item.folder.createdAt)}
        </span>
      ),
    },
  ];

  if (status.data && !status.data.configured) {
    return (
      <div className="space-y-5">
        <PageHeader title="Files" />
        <StateMessage icon={CloudOff} title="File storage isn't set up" description="Add the R2 settings to the server, and files will work here." />
      </div>
    );
  }

  const open = (item: Item) => (item.kind === "folder" ? setFolderId(item.folder.id) : setOpenId(item.file.id));
  const openFile = (files.data as FileRow[] | undefined)?.find((file) => file.id === openId);
  const trashCount = trash ? (files.data?.length ?? 0) : 0;

  return (
    <div className="relative space-y-5" {...pageDrop}>
      {fileDragOver && (
        <div className="pointer-events-none fixed inset-0 z-50 flex animate-overlay-in items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="flex animate-modal-in flex-col items-center rounded-3xl border-2 border-dashed border-accent bg-card px-12 py-10 text-center">
            <CloudUpload className="size-10 animate-bounce text-accent" aria-hidden />
            <p className="mt-4 font-display text-2xl">Drop to upload</p>
            <p className="mt-1 text-sm text-muted-foreground">Files and whole folders, into {path.data?.at(-1)?.name ?? "All files"}</p>
          </div>
        </div>
      )}

      <PageHeader
        title="Files"
        subtitle={property?.name ?? "All properties"}
        actions={
          trash ? (
            <button
              type="button"
              disabled={trashCount === 0 || deleteForever.isPending}
              onClick={() => {
                if (window.confirm(`Empty the trash? ${trashCount} ${trashCount === 1 ? "file" : "files"} will be deleted for good.`)) {
                  deleteForever.mutate({}, { onSuccess: ({ deleted, failed: missed }) => void done(missed ? `Deleted ${deleted}; ${missed} couldn't be removed` : "The trash is empty")() });
                }
              }}
              className={buttonClass({ variant: "secondary", shape: "pill" })}
            >
              {deleteForever.isPending ? <Spinner /> : <Trash2 aria-hidden />}
              Empty trash
            </button>
          ) : (
            <>
              <button type="button" onClick={() => setNaming({})} className={buttonClass({ variant: "secondary", shape: "pill" })}>
                <FolderPlus aria-hidden />
                New folder
              </button>
              <button type="button" onClick={() => setUploading({})} className={buttonClass({ shape: "pill" })}>
                <Upload aria-hidden />
                Upload
              </button>
            </>
          )
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatTile
          tone="gold"
          icon={HardDrive}
          label="In use"
          value={formatBytes(status.data?.used.bytes ?? 0)}
          hint={`${status.data?.used.files ?? 0} ${status.data?.used.files === 1 ? "file" : "files"}`}
          loading={status.isPending}
        />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <SearchInput value={typed} onChange={setTyped} placeholder="Search files by name" className="w-full lg:w-72" />
        <FilterPills label="Filter files" options={kinds} value={kind} onChange={setKind} />
        <div className="flex gap-1 lg:ml-auto">
          {(
            [
              ["list", List],
              ["grid", LayoutGrid],
            ] as const
          ).map(([key, Icon]) => (
            <button
              key={key}
              type="button"
              aria-label={`${key} view`}
              aria-pressed={view === key}
              onClick={() => setView(key)}
              className={`rounded-full p-2 transition-colors ${view === key ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Icon className="size-4" />
            </button>
          ))}
        </div>
      </div>

      {browsing && (
        <nav aria-label="Folders" className="flex flex-wrap items-center gap-1 text-sm">
          <button
            type="button"
            onClick={() => setFolderId(null)}
            {...dropZone(null)}
            className={`rounded-full px-2.5 py-1 transition-colors ${dropTarget === null ? "bg-accent text-accent-foreground" : folderId ? "text-muted-foreground hover:text-foreground" : ""}`}
          >
            All files
          </button>
          {path.data?.map((step) => (
            <span key={step.id} className="inline-flex items-center gap-1">
              <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden />
              <button
                type="button"
                onClick={() => setFolderId(step.id)}
                {...(step.id === folderId ? {} : dropZone(step.id))}
                className={`rounded-full px-2.5 py-1 transition-colors ${dropTarget === step.id ? "bg-accent text-accent-foreground" : step.id === folderId ? "" : "text-muted-foreground hover:text-foreground"}`}
              >
                {step.name}
              </button>
            </span>
          ))}
          {!trash && (items?.length ?? 0) > 0 && <span className="ml-auto hidden text-xs text-muted-foreground sm:block">Drag items onto a folder to move them</span>}
        </nav>
      )}

      {files.isError ? (
        <ErrorMessage title="Files didn't load" error={files.error} onRetry={() => void files.refetch()} />
      ) : view === "list" || (items?.length ?? 0) === 0 ? (
        <DataTable
          columns={columns}
          rows={items}
          rowKey={(item) => item.key}
          onRowClick={open}
          rowLabel={(item) => (item.kind === "folder" ? item.folder.name : item.file.name)}
          loading={!items}
          selection={{ selected: picked, onChange: setPicked }}
          rowProps={(item) => ({ ...dragSource(item), ...(item.kind === "folder" ? dropZone(item.folder.id) : {}) })}
          rowClassName={(item) => (item.kind === "folder" && dropTarget === item.folder.id ? "!bg-accent/20 outline-2 -outline-offset-2 outline-accent" : "")}
          empty={
            trash ? (
              <StateMessage icon={Trash2} title="The trash is empty" description="Deleted files wait here for 30 days." />
            ) : (
              <StateMessage
                icon={Inbox}
                title={search ? "Nothing matches that" : folderId ? "This folder is empty" : "No files here yet"}
                description={search ? "Check the spelling." : "Drag files or whole folders onto this page, or press Upload."}
              />
            )
          }
        />
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {items?.map((item, index) => {
            const ticked = picked.has(item.key);
            const over = item.kind === "folder" && dropTarget === item.folder.id;
            return (
              <li
                key={item.key}
                style={{ animationDelay: `${Math.min(index, 15) * 20}ms` }}
                {...dragSource(item)}
                {...(item.kind === "folder" ? dropZone(item.folder.id) : {})}
                className={`group relative animate-rise-in rounded-3xl border bg-card transition-all duration-200 hover:-translate-y-0.5 ${
                  over ? "scale-105 border-accent bg-accent/15" : ticked ? "border-accent bg-accent/[0.07]" : "border-border/60 hover:border-accent/50"
                }`}
              >
                <span className={`absolute top-3 left-3 z-10 transition-opacity ${ticked ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100"}`}>
                  <Checkbox
                    checked={ticked}
                    label={`Select ${item.kind === "folder" ? item.folder.name : item.file.name}`}
                    onChange={(on) =>
                      setPicked((current) => {
                        const next = new Set(current);
                        if (on) next.add(item.key);
                        else next.delete(item.key);
                        return next;
                      })
                    }
                  />
                </span>
                <button type="button" onClick={() => open(item)} className="flex w-full flex-col items-center gap-3 p-4 text-center">
                  <span className={`flex size-14 items-center justify-center rounded-2xl ${item.kind === "folder" ? "bg-accent/15" : "bg-secondary"}`}>
                    {item.kind === "folder" ? (
                      over ? <FolderOpen className="size-7 text-accent" aria-hidden /> : <Folder className="size-7 text-accent" aria-hidden />
                    ) : (
                      <FileTypeIcon type={item.file.contentType} className="size-7" />
                    )}
                  </span>
                  <span className="w-full truncate text-sm">{item.kind === "folder" ? item.folder.name : item.file.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {item.kind === "folder" ? `${item.folder._count.files} ${item.folder._count.files === 1 ? "file" : "files"}` : formatBytes(item.file.sizeBytes)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <BulkBar count={picked.size} noun={["item", "items"]} actions={actions} onClear={() => setPicked(new Set())} />

      <FileDrawer file={openFile} onClose={() => setOpenId(undefined)} />
      {uploading && <UploadModal place={folderId ? { folderId } : {}} initial={uploading.initial} onClose={() => setUploading(undefined)} />}
      {naming && <NameFolder parentId={folderId} propertyId={selectedId} renaming={naming.renaming} onClose={() => setNaming(undefined)} onDone={() => setPicked(new Set())} />}
      {moving && (
        <MoveTo
          propertyId={selectedId}
          exclude={pickedFolders}
          onClose={() => setMoving(false)}
          onPick={async (to) => {
            await moveTo([...picked], to);
            setMoving(false);
          }}
        />
      )}
    </div>
  );
}

/** New folder, or renaming one. */
function NameFolder({
  parentId,
  propertyId,
  renaming,
  onClose,
  onDone,
}: {
  parentId: string | null;
  propertyId?: string;
  renaming?: FolderRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(renaming?.name ?? "");
  const options = {
    onSuccess: async () => {
      toast.success(renaming ? "Renamed" : "Folder created");
      await queryClient.invalidateQueries({ queryKey: trpc.files.pathKey() });
      onDone();
      onClose();
    },
    onError: (error: { message?: string }) => toast.error(friendlyError(error)),
  };
  const create = useMutation(trpc.files.createFolder.mutationOptions(options));
  const rename = useMutation(trpc.files.renameFolder.mutationOptions(options));
  const pending = create.isPending || rename.isPending;
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      icon={<FolderPlus className="size-4" />}
      title={renaming ? "Rename folder" : "New folder"}
      footer={
        <button type="submit" form="name-folder" disabled={pending || !name.trim()} className={buttonClass({ shape: "pill" })}>
          {pending && <Spinner />}
          {renaming ? "Rename" : "Create folder"}
        </button>
      }
    >
      <form
        id="name-folder"
        onSubmit={(event) => {
          event.preventDefault();
          if (renaming) rename.mutate({ id: renaming.id, name });
          else create.mutate({ name, parentId: parentId ?? undefined, propertyId });
        }}
      >
        <label className="block text-xs">
          Folder name
          <input
            required
            autoFocus
            maxLength={80}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-1 w-full rounded-xl border border-input bg-transparent px-3 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          />
        </label>
      </form>
    </Modal>
  );
}

/** "Move to…": every folder as an indented tree, plus the top level. */
function MoveTo({ propertyId, exclude, onClose, onPick }: { propertyId?: string; exclude: string[]; onClose: () => void; onPick: (to: string | null) => Promise<void> }) {
  const folders = useQuery(trpc.files.allFolders.queryOptions({ propertyId }));
  const [busy, setBusy] = useState<string | null | undefined>();

  const rows = useMemo(() => {
    const all = folders.data ?? [];
    const children = new Map<string | null, typeof all>();
    for (const folder of all) children.set(folder.parentId, [...(children.get(folder.parentId) ?? []), folder]);
    const out: { id: string; name: string; depth: number }[] = [];
    // A folder being moved can't take itself, so it and its insides are left out.
    const walk = (parent: string | null, depth: number) => {
      for (const folder of children.get(parent) ?? []) {
        if (exclude.includes(folder.id)) continue;
        out.push({ id: folder.id, name: folder.name, depth });
        if (depth < 12) walk(folder.id, depth + 1);
      }
    };
    walk(null, 0);
    return out;
  }, [exclude, folders.data]);

  const pick = async (to: string | null) => {
    setBusy(to);
    try {
      await onPick(to);
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <Modal open onClose={onClose} size="sm" icon={<FolderInput className="size-4" />} title="Move to" description="Or drag them onto a folder.">
      <ul className="space-y-1">
        <li>
          <button type="button" disabled={busy !== undefined} onClick={() => void pick(null)} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-secondary">
            {busy === null ? <Spinner /> : <HardDrive className="size-4 text-muted-foreground" aria-hidden />}
            All files (top level)
          </button>
        </li>
        {rows.map((folder) => (
          <li key={folder.id}>
            <button
              type="button"
              disabled={busy !== undefined}
              onClick={() => void pick(folder.id)}
              style={{ paddingLeft: `${0.75 + folder.depth * 1.25}rem` }}
              className="flex w-full items-center gap-2 rounded-xl py-2 pr-3 text-left text-sm hover:bg-secondary"
            >
              {busy === folder.id ? <Spinner /> : <Folder className="size-4 shrink-0 text-accent" aria-hidden />}
              <span className="truncate">{folder.name}</span>
            </button>
          </li>
        ))}
        {folders.isPending && <li className="px-3 py-2 text-sm text-muted-foreground">Loading folders…</li>}
      </ul>
    </Modal>
  );
}
