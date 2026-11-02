"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, CloudOff, Folder, FolderPlus, HardDrive, Inbox, LayoutGrid, List, Trash2, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { buttonClass } from "@/components/brand/button";
import { Spinner } from "@/components/brand/spinner";
import { ErrorMessage, friendlyError, StateMessage } from "@/components/brand/state";
import { trpc } from "@/utils/trpc";

import { FileDrawer, type FileRow } from "./file-drawer";
import { useProperties } from "./property-context";
import { DataTable, type Column } from "./ui/data-table";
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

function day(value: string): string {
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function FilesManager() {
  const { selectedId, selected } = useProperties();
  const [kind, setKind] = useState<Kind>("all");
  const [typed, setTyped] = useState("");
  const [search, setSearch] = useState("");
  const [folderId, setFolderId] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "grid">("list");
  const [openId, setOpenId] = useState<string>();
  const [uploading, setUploading] = useState(false);
  const [naming, setNaming] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    const timer = setTimeout(() => setSearch(typed.trim()), 250);
    return () => clearTimeout(timer);
  }, [typed]);

  // A property changing means a different tree.
  useEffect(() => setFolderId(null), [selectedId]);

  const status = useQuery(trpc.files.status.queryOptions());
  const browsing = !search && kind !== "trash";
  const files = useQuery(
    trpc.files.list.queryOptions({ folderId: browsing ? folderId : undefined, propertyId: selectedId, search: search || undefined, kind }),
  );
  const folders = useQuery({
    ...trpc.files.folders.queryOptions({ parentId: folderId, propertyId: selectedId }),
    enabled: browsing && kind === "all",
  });
  const path = useQuery({ ...trpc.files.folderPath.queryOptions(folderId ?? ""), enabled: Boolean(folderId) });

  const removeFolder = useMutation(
    trpc.files.deleteFolder.mutationOptions({
      onSuccess: async () => {
        toast.success("Folder deleted");
        await queryClient.invalidateQueries();
      },
      onError: (error) => toast.error(friendlyError(error)),
    }),
  );

  const rows = files.data as FileRow[] | undefined;
  const open = rows?.find((file) => file.id === openId);

  const columns: Column<FileRow>[] = [
    {
      key: "name",
      header: "Name",
      sortValue: (row) => row.name.toLowerCase(),
      render: (row) => (
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary">
            <FileTypeIcon type={row.contentType} />
          </span>
          <span className="min-w-0">
            <span className="block max-w-[14rem] truncate sm:max-w-sm">{row.name}</span>
            {row.description && <span className="block max-w-[14rem] truncate text-xs text-muted-foreground sm:max-w-sm">{row.description}</span>}
          </span>
        </span>
      ),
    },
    { key: "size", header: "Size", hideBelow: "sm", sortValue: (row) => row.sizeBytes, render: (row) => <span className="whitespace-nowrap text-muted-foreground">{formatBytes(row.sizeBytes)}</span> },
    { key: "by", header: "Uploaded by", hideBelow: "lg", render: (row) => <span className="text-muted-foreground">{row.uploadedBy}</span> },
    { key: "date", header: "Added", align: "right", hideBelow: "md", sortValue: (row) => row.createdAt, render: (row) => <span className="whitespace-nowrap text-muted-foreground">{day(row.createdAt)}</span> },
  ];

  if (status.data && !status.data.configured) {
    return (
      <div className="space-y-5">
        <PageHeader title="Files" />
        <StateMessage icon={CloudOff} title="File storage isn't set up" description="Add the R2 settings to the server, and files will work here." />
      </div>
    );
  }

  const noFolders = (folders.data?.length ?? 0) === 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Files"
        subtitle={selected?.name ?? "All properties"}
        actions={
          <>
            <button type="button" onClick={() => setNaming(true)} className={buttonClass({ variant: "secondary", shape: "pill" })}>
              <FolderPlus aria-hidden />
              New folder
            </button>
            <button type="button" onClick={() => setUploading(true)} className={buttonClass({ shape: "pill" })}>
              <Upload aria-hidden />
              Upload
            </button>
          </>
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
              className={`rounded-full p-2 ${view === key ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Icon className="size-4" />
            </button>
          ))}
        </div>
      </div>

      {browsing && kind === "all" && (
        <nav aria-label="Folders" className="flex flex-wrap items-center gap-1 text-sm">
          <button type="button" onClick={() => setFolderId(null)} className={folderId ? "text-muted-foreground hover:text-foreground" : ""}>
            All files
          </button>
          {path.data?.map((step) => (
            <span key={step.id} className="inline-flex items-center gap-1">
              <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden />
              <button type="button" onClick={() => setFolderId(step.id)} className={step.id === folderId ? "" : "text-muted-foreground hover:text-foreground"}>
                {step.name}
              </button>
            </span>
          ))}
        </nav>
      )}

      {browsing && kind === "all" && !noFolders && (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {folders.data?.map((folder) => (
            <li key={folder.id} className="group flex items-center gap-2 rounded-2xl border border-border/60 bg-card px-3 py-2.5 hover:border-accent/50">
              <button type="button" onClick={() => setFolderId(folder.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <Folder className="size-5 shrink-0 text-accent" aria-hidden />
                <span className="min-w-0">
                  <span className="block truncate text-sm">{folder.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {folder._count.files} {folder._count.files === 1 ? "file" : "files"}
                  </span>
                </span>
              </button>
              {folder._count.files === 0 && folder._count.children === 0 && (
                <button
                  type="button"
                  aria-label={`Delete ${folder.name}`}
                  disabled={removeFolder.isPending}
                  onClick={() => removeFolder.mutate(folder.id)}
                  className="rounded-full p-1.5 text-muted-foreground hover:text-foreground"
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {files.isError ? (
        <ErrorMessage title="Files didn't load" error={files.error} onRetry={() => void files.refetch()} />
      ) : view === "list" || (rows?.length ?? 0) === 0 ? (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          onRowClick={(row) => setOpenId(row.id)}
          rowLabel={(row) => `Open ${row.name}`}
          loading={files.isPending}
          empty={
            kind === "trash" ? (
              <StateMessage icon={Trash2} title="The trash is empty" description="Deleted files wait here for 30 days." />
            ) : noFolders || !browsing ? (
              <StateMessage
                icon={Inbox}
                title={search ? "Nothing matches that" : "No files here yet"}
                description={search ? "Check the spelling." : "Upload contracts, licences, menus and anything else the team needs to find."}
              />
            ) : (
              <span />
            )
          }
        />
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {rows?.map((file) => (
            <li key={file.id}>
              <button
                type="button"
                onClick={() => setOpenId(file.id)}
                className="flex w-full flex-col items-center gap-3 rounded-3xl border border-border/60 bg-card p-4 text-center hover:border-accent/50"
              >
                <span className="flex size-14 items-center justify-center rounded-2xl bg-secondary">
                  <FileTypeIcon type={file.contentType} className="size-7" />
                </span>
                <span className="w-full truncate text-sm">{file.name}</span>
                <span className="text-xs text-muted-foreground">{formatBytes(file.sizeBytes)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <FileDrawer file={open} onClose={() => setOpenId(undefined)} />
      {uploading && <UploadModal place={folderId ? { folderId } : {}} onClose={() => setUploading(false)} />}
      {naming && <NewFolder parentId={folderId} propertyId={selectedId} onClose={() => setNaming(false)} />}
    </div>
  );
}

function NewFolder({ parentId, propertyId, onClose }: { parentId: string | null; propertyId?: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const create = useMutation(
    trpc.files.createFolder.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries();
        onClose();
      },
      onError: (error) => toast.error(friendlyError(error)),
    }),
  );
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      icon={<FolderPlus className="size-4" />}
      title="New folder"
      footer={
        <button type="submit" form="new-folder" disabled={create.isPending || !name.trim()} className={buttonClass({ shape: "pill" })}>
          {create.isPending && <Spinner />}
          Create folder
        </button>
      }
    >
      <form
        id="new-folder"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate({ name, parentId: parentId ?? undefined, propertyId });
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
            className="mt-1 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring/50"
          />
        </label>
      </form>
    </Modal>
  );
}
