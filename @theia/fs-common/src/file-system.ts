import {Path} from "./path";
import {Disposable} from "@theia/platform-common";

export const FileSystem = Symbol("FileSystem");

export interface FileSystem {

    isRoot(path: Path): boolean ;

    ls(path: Path): Promise<Path[]> ;

    chmod(path: Path, mode: number): Promise<boolean> ;

    mkdir(path: Path, mode?: number): Promise<boolean> ;

    rename(oldPath: Path, newPath: Path): Promise<boolean> ;

    rmdir(path: Path): Promise<boolean> ;

    rm(path: Path): Promise<boolean> ;

    readFile(path: Path, encoding: string): Promise<string>;

    writeFile(path: Path, data: string, encoding?: string): Promise<boolean>;

    exists(path: Path): Promise<boolean> ;

    /**
     * `path` exists and is a directory
     */
    dirExists(path: Path): Promise<boolean> ;

    /**
     * `path` exists and is a file.
     */
    fileExists(path: Path): Promise<boolean> ;

    /**
     * watch for file changes
     * @param watcher
     * @returns a disposable to remove the listener again.
     */
    watch(watcher:FileSystemWatcher) : Disposable;
}

export type FileSystemWatcher =  (event:FileChangeEvent) => void;

export class FileChangeEvent {
    constructor(public readonly changes: FileChange[]) {}
}

export class FileChange {
    constructor(
        public readonly path: Path,
        public readonly type: FileChangeType) {}
}

export enum FileChangeType {
    UPDATED = 0,
    ADDED = 1,
    DELETED = 2
}