import * as fs from "fs";
import * as URI from "urijs";
import { FileStat, FileSystem2, FileSystemClient } from '../common/filesystem2';

export class FileSystemNode implements FileSystem2 {

    protected client: FileSystemClient|undefined

    constructor(protected rootURI: string) {
    }

    setClient(client: FileSystemClient) {
        this.client = client
    }

    getFileStat(uriAsString: string): Promise<FileStat> {
        const uri = toURI(uriAsString);
        return new Promise<FileStat>((resolve, reject) => {
            try {
                resolve(this.doGetStat(uri, 1));
            } catch (error) {
                reject(error);
            }
        });
    }

    exists(uri: string): Promise<boolean> {
        return Promise.resolve(this.doGetStat(toURI(uri), 0) !== undefined);
    }

    resolveContent(uri: string, options?: { encoding?: string }): Promise<{ stat: FileStat, content: string }> {
        return new Promise<{ stat: FileStat, content: string }>((resolve, reject) => {
            const _uri = toURI(uri);
            const stat = this.doGetStat(_uri, 0);
            if (stat.isDirectory) {
                return reject(new Error(`Cannot resolve the content of a directory. URI: ${uri}.`));
            }
            const encoding = this.doGetEncoding(options);
            fs.readFile(_uri.path(), encoding, (error, content) => {
                if (error) {
                    return reject(error);
                }
                resolve({ stat, content });
            });
        });
    }

    setContent(file: FileStat, content: string, options?: { encoding?: string }): Promise<FileStat> {
        return new Promise<FileStat>((resolve, reject) => {
            const _uri = toURI(file.uri);
            const stat = this.doGetStat(_uri, 0);
            if (stat.isDirectory) {
                return reject(new Error(`Cannot set the content of a directory. URI: ${file.uri}.`));
            }
            if (stat.lastModification !== file.lastModification) {
                return reject(new Error(`File is out of sync. URI: ${file.uri}. Expected timestamp: ${stat.lastModification}. Actual timestamp: ${file.lastModification}.`));
            }
            if (stat.size !== file.size) {
                return reject(new Error(`File is out of sync. URI: ${file.uri}. Expected size: ${stat.size}. Actual size: ${file.size}.`));
            }
            const encoding = this.doGetEncoding(options);
            fs.writeFile(_uri.path(), content, encoding, error => {
                if (error) {
                    return reject(error);
                }
                resolve(this.doGetStat(_uri, 0));
            });
        });
    }

    move(sourceUri: string, targetUri: string, options?: { overwrite?: boolean }): Promise<FileStat> {
        return new Promise<FileStat>((resolve, reject) => {
            const _sourceUri = toURI(sourceUri);
            const stat = this.doGetStat(_sourceUri, 0);
            console.log(stat);
        });
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

    protected doGetStat(uri: uri.URI, depth: number): FileStat {
        const stat = fs.statSync(toNodePath(uri));
        if (stat.isDirectory()) {
            const files = fs.readdirSync(toNodePath(uri));
            let children = undefined;
            if (depth > 0) {
                children = files.map(file => {
                    const newURI = uri.clone().segment(file)
                    return this.doGetStat(newURI, depth - 1)
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

    protected doGetEncoding(option?: { encoding?: string }): string {
        // TODO: this should fall back to the workspace default if it cannot be retrieved from the argument.
        return (option && option.encoding) || "utf8";
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