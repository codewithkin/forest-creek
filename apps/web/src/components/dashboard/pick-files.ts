/**
 * Files picked for upload, each with the folder it sat in. Dropping a folder
 * used to hand the browser's empty placeholder for the folder itself to the
 * upload ("Size bytes: too small"); now its files are read out, all the way
 * down, and the tree is rebuilt in the file store.
 */

export type PickedFile = {
  file: File;
  /** The folder path it came from, like "Thyme/Basil"; "" when it wasn't in a folder. */
  folder: string;
};

/** What operating systems leave in folders, which nobody means to upload. */
const JUNK = /^(?:\.ds_store|thumbs\.db|desktop\.ini|\._.*)$/i;

const wanted = (name: string) => !JUNK.test(name);

/** The folder part of a relative path: "Thyme/Basil/bed.jpg" is "Thyme/Basil". */
export function folderOf(relativePath: string): string {
  const parts = relativePath.split("/").filter(Boolean);
  return parts.slice(0, -1).join("/");
}

/** From a file input, including one with `webkitdirectory` (which fills webkitRelativePath). */
export function filesFromInput(list: FileList | null): PickedFile[] {
  return [...(list ?? [])].filter((file) => wanted(file.name)).map((file) => ({ file, folder: folderOf(file.webkitRelativePath || file.name) }));
}

type Entry = FileSystemEntry;

function fileOf(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

/** A directory reader hands entries over in batches; reading stops at an empty one. */
async function childrenOf(entry: FileSystemDirectoryEntry): Promise<Entry[]> {
  const reader = entry.createReader();
  const all: Entry[] = [];
  for (;;) {
    const batch = await new Promise<Entry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (batch.length === 0) return all;
    all.push(...batch);
  }
}

async function walk(entry: Entry, folder: string, out: PickedFile[], depth: number): Promise<void> {
  if (entry.isFile) {
    if (wanted(entry.name)) out.push({ file: await fileOf(entry as FileSystemFileEntry), folder });
    return;
  }
  if (entry.isDirectory && depth < 20) {
    const inside = folder ? `${folder}/${entry.name}` : entry.name;
    for (const child of await childrenOf(entry as FileSystemDirectoryEntry)) await walk(child, inside, out, depth + 1);
  }
}

/**
 * From a drop: folders are walked, files taken as they are. Browsers without
 * the entries API fall back to the plain file list, minus folder placeholders
 * (which arrive as zero-byte files with no type).
 */
export async function filesFromDrop(data: DataTransfer): Promise<PickedFile[]> {
  // The entries must be taken synchronously, before the first await.
  const entries = [...data.items].map((item) => (item.kind === "file" ? item.webkitGetAsEntry?.() : null));
  if (entries.length > 0 && entries.every((entry) => entry)) {
    const out: PickedFile[] = [];
    for (const entry of entries) await walk(entry!, "", out, 0);
    return out;
  }
  return [...data.files].filter((file) => wanted(file.name) && !(file.size === 0 && file.type === "")).map((file) => ({ file, folder: "" }));
}
