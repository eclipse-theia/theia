export const FileSystem = Symbol("FileSystem");

export interface FileSystem {

    /**
     * Returns the filestat for the given uri.
     *
     * If the uri points to a folder it will contain one level of unresolved children.
     */
    getFileStat(uri: string): Promise<FileStat>;

    /**
     *Finds out if a file identified by the resource exists.
     */
    existsFile(uri: string): Promise<boolean>;

    /**
     * Resolve the contents of a file identified by the resource.
     */
    getContent(uri: string, encoding?: string): Promise<string>;

    /**
     * Updates the content replacing its previous value.
     */
    setContent(file: FileStat, content: string, encoding?: string): Promise<FileStat>;

    /**
     * Moves the file to a new path identified by the resource.
     *
     * The optional parameter overwrite can be set to replace an existing file at the location.
     */
    moveFile(sourceUri: string, targetUri: string, overwrite?: boolean): Promise<FileStat>;

    /**
     * Copies the file to a path identified by the resource.
     *
     * The optional parameter overwrite can be set to replace an existing file at the location.
     */
    copyFile(sourceUri: string, targetUri: string, overwrite?: boolean): Promise<FileStat>;

    /**
     * Creates a new file with the given path. The returned promise
     * will have the stat model object as a result.
     *
     * The optional parameter content can be used as value to fill into the new file.
     */
    createFile(uri: string, content?: string): Promise<FileStat>;

    /**
     * Creates a new folder with the given path. The returned promise
     * will have the stat model object as a result.
     */
    createFolder(uri: string): Promise<FileStat>;

    /**
     * Renames the provided file to use the new name. The returned promise
     * will have the stat model object as a result.
     */
    rename(uri: string, newName: string): Promise<FileStat>;

    /**
     * Creates a new empty file if the given path does not exist and otherwise
     * will set the mtime and atime of the file to the current date.
     */
    touchFile(uri: string): Promise<FileStat>;

    /**
     * Deletes the provided file.  The optional useTrash parameter allows to
     * move the file to trash.
     */
    del(uri: string, useTrash?: boolean): Promise<void>;

    /**
     * Allows to start a watcher that reports file change events on the provided resource.
     */
    watchFileChanges(uri: string): void;

    /**
     * Allows to stop a watcher on the provided resource or absolute fs path.
     */
    unwatchFileChanges(uri: string): void;

    /**
     * Returns the preferred encoding to use for a given resource.
     */
    getEncoding(uri: string, preferredEncoding?: string): Promise<string>;

    /**
     * Returns the workspace root
     */
    getWorkspaceRoot(): Promise<FileStat>;

}

export interface FileSystemClient {
    /**
     * Notifies about file changes
     */
    onFileChanges(event: FileChangesEvent): void
}

export class FileChangesEvent {
    constructor(public readonly changes: FileChange[]) {}
}

export class FileChange {
    constructor(
        public readonly uri: string,
        public readonly type: FileChangeType) {}
}

export enum FileChangeType {
    UPDATED = 0,
    ADDED = 1,
    DELETED = 2
}


/**
 * A file resource with meta information.
 */
export interface FileStat {

    /**
     * The uri of the file.
     */
    uri: string;

    /**
     * The last modification of this file.
     */
    lastModification: number;

    /**
     * The resource is a directory. Iff {{true}}
     * {{encoding}} has no meaning.
     */
    isDirectory: boolean;

    /**
     * Return {{true}} when this is a directory
     * that is not empty.
     */
    hasChildren?: boolean;

    /**
     * The children of the file stat.
     * If it is undefined and isDirectory is true, then this file stat is unresolved.
     */
    children?: FileStat[];

    /**
     * The size of the file if known.
     */
    size?: number;

}