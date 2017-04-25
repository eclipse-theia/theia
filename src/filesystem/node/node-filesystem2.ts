import { FileSystem, FileStat } from '../common';
import * as fs from "fs";
import * as URI from "urijs";


function toURI(uri: string): uri.URI {
    if (!uri) {
        throw new Error('The argument \'uri\' should be specified.');
    }
    return new URI(uri)
}

function toNodePath(uri: uri.URI): string {
    return uri.path()
}

export class FileSystemNode implements FileSystem {

    constructor(protected rootURI: string) {}


    getFileStat(uriAsString: string): Promise<FileStat> {
        const uri = toURI(uriAsString)
        return new Promise<FileStat>((resolve, reject) => {
            resolve(this.internalGetStat(uri, 1))
        });
    }

    protected internalGetStat(uri: uri.URI, depth: number): FileStat {
        let stat = fs.statSync(toNodePath(uri))
        if (stat.isDirectory()) {
            let files = fs.readdirSync(toNodePath(uri))
            let children = undefined
            if (depth > 0) {
                children = files.map(file => {
                    let newURI = uri.clone().segment(file)
                    return this.internalGetStat(newURI, depth - 1)
                })
            }
            return {
                uri: uri.toString(),
                lastModification: stat.mtime.getTime(),
                isDirectory: true,
                hasChildren: files.length > 0,
                children
            }
        } else {
            return {
                uri: uri.toString(),
                lastModification: stat.mtime.getTime(),
                isDirectory: false,
                size: stat.size
            }
        }
    }

    existsFile(uri: string): Promise<boolean> {
        return Promise.resolve(this.internalGetStat(toURI(uri), 0) !== undefined);
    }

    getContent(uri: string, encoding?: string | undefined): Promise<string> {
        throw new Error('Method not implemented.');
    }
    setContent(file: FileStat, content: string, encoding?: string | undefined): Promise<FileStat> {
        throw new Error('Method not implemented.');
    }
    moveFile(sourceUri: string, targetUri: string, overwrite?: boolean | undefined): Promise<FileStat> {
        throw new Error('Method not implemented.');
    }
    copyFile(sourceUri: string, targetUri: string, overwrite?: boolean | undefined): Promise<FileStat> {
        throw new Error('Method not implemented.');
    }
    createFile(uri: string, content?: string | undefined): Promise<FileStat> {
        throw new Error('Method not implemented.');
    }
    createFolder(uri: string): Promise<FileStat> {
        throw new Error('Method not implemented.');
    }
    rename(uri: string, newName: string): Promise<FileStat> {
        throw new Error('Method not implemented.');
    }
    touchFile(uri: string): Promise<FileStat> {
        throw new Error('Method not implemented.');
    }
    del(uri: string, useTrash?: boolean | undefined): Promise<void> {
        throw new Error('Method not implemented.');
    }
    watchFileChanges(uri: string): void {
        throw new Error('Method not implemented.');
    }
    unwatchFileChanges(uri: string): void {
        throw new Error('Method not implemented.');
    }
    getEncoding(uri: string, preferredEncoding?: string | undefined): Promise<string> {
        throw new Error('Method not implemented.');
    }
    getWorkspaceRoot(): Promise<FileStat> {
        throw new Error('Method not implemented.');
    }


}