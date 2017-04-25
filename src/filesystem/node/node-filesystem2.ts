import { FileSystem, FileStat } from "../common/filesystem2";
import * as fs from "fs";
import * as URI from "urijs";

export class FileSystemNode implements FileSystem {

    constructor(protected rootURI: string) {
    }

    getFileStat(uriAsString: string): Promise<FileStat> {
        const uri = toURI(uriAsString);
        return new Promise<FileStat>((resolve, reject) => {
            resolve(this.internalGetStat(uri, 1));
        });
    }

    protected internalGetStat(uri: uri.URI, depth: number): FileStat {
        const stat = fs.statSync(toNodePath(uri));
        if (stat.isDirectory()) {
            const files = fs.readdirSync(toNodePath(uri));
            let children = undefined;
            if (depth > 0) {
                children = files.map(file => {
                    const newURI = uri.clone().segment(file)
                    return this.internalGetStat(newURI, depth - 1)
                });
            }
            return {
                uri: uri.toString(),
                lastModification: stat.mtime.getTime(),
                isDirectory: true,
                hasChildren: files.length > 0,
                children
            };
        } else {
            return {
                uri: uri.toString(),
                lastModification: stat.mtime.getTime(),
                isDirectory: false,
                size: stat.size
            };
        }
    }

    exists(uri: string): Promise<boolean> {
        return Promise.resolve(this.internalGetStat(toURI(uri), 0) !== undefined);
    }

    resolveContent(uri: string, options?: { encoding?: string }): Promise<{ stat: FileStat, content: string; }> {
        throw new Error('Method not implemented.');
    }

    setContent(file: FileStat, content: string, options?: { encoding?: string }): Promise<FileStat> {
        throw new Error('Method not implemented.');
    }

    move(sourceUri: string, targetUri: string, options?: { overwrite?: boolean }): Promise<FileStat> {
        throw new Error('Method not implemented.');
    }

    copy(sourceUri: string, targetUri: string, options?: { overwrite?: boolean, recursive?: boolean }): Promise<FileStat> {
        throw new Error('Method not implemented.');
    }

    createFile(uri: string, options?: { content?: string }): Promise<FileStat> {
        throw new Error('Method not implemented.');
    }

    createFolder(uri: string): Promise<FileStat> {
        throw new Error('Method not implemented.');
    }

    touchFile(uri: string): Promise<FileStat> {
        throw new Error('Method not implemented.');
    }

    delete(uri: string, options?: { useTrash?: boolean }): Promise<void> {
        throw new Error('Method not implemented.');
    }

    watchFileChanges(uri: string): void {
        throw new Error('Method not implemented.');
    }

    unwatchFileChanges(uri: string): void {
        throw new Error('Method not implemented.');
    }

    getEncoding(uri: string, options?: { preferredEncoding?: string }): Promise<string> {
        throw new Error('Method not implemented.');
    }

    getWorkspaceRoot(): Promise<FileStat> {
        throw new Error('Method not implemented.');
    }

}

function toURI(uri: string): uri.URI {
    if (!uri) {
        throw new Error('The argument \'uri\' should be specified.');
    }
    return new URI(uri);
}

function toNodePath(uri: uri.URI): string {
    return uri.path();
}