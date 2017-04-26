import * as fs from "fs-extra";
import { FileStat, FileSystem2, FileSystemClient } from '../common/filesystem2';
import URI from "../../application/common/uri";

export class FileSystemNode implements FileSystem2 {

    protected client: FileSystemClient | undefined

    constructor(protected rootURI: string) {
    }

    setClient(client: FileSystemClient) {
        this.client = client
    }

    getFileStat(uriAsString: string): Promise<FileStat> {
        const uri = toURI(uriAsString);
        return new Promise<FileStat>((resolve, reject) => {
            const stat = this.doGetStat(uri, 1);
            if (!stat) {
                return reject(new Error(`Cannot find file under the given URI. URI: ${uri}.`));
            }
            resolve(stat);
        });
    }

    exists(uri: string): Promise<boolean> {
        return new Promise<boolean>((resolve, reject) => {
            return this.doGetStat(toURI(uri), 0) !== undefined;
        });
    }

    resolveContent(uri: string, options?: { encoding?: string }): Promise<{ stat: FileStat, content: string }> {
        return new Promise<{ stat: FileStat, content: string }>((resolve, reject) => {
            const _uri = toURI(uri);
            const stat = this.doGetStat(_uri, 0);
            if (!stat) {
                return reject(new Error(`Cannot find file under the given URI. URI: ${uri}.`));
            }
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
            if (!stat) {
                return reject(new Error(`Cannot find file under the given URI. URI: ${file.uri}.`));
            }
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
                try {
                    resolve(this.doGetStat(_uri, 1));
                } catch (error) {
                    reject(error);
                }
            });
        });
    }

    move(sourceUri: string, targetUri: string, options?: { overwrite?: boolean }): Promise<FileStat> {
        return new Promise<FileStat>((resolve, reject) => {
            const _sourceUri = toURI(sourceUri);
            const sourceStat = this.doGetStat(_sourceUri, 0);
            if (!sourceStat) {
                return reject(new Error(`File does not exist under ${sourceUri}.`));
            }
            const _targetUri = toURI(targetUri);
            const overwrite = this.doGetOverwrite(options);
            const targetStat = this.doGetStat(_targetUri, 0);
            if (targetStat && !overwrite) {
                return reject(new Error(`File already exist under the \'${targetUri}\' target location. Did you set \'overwrite\' to true?`));
            }
            fs.rename(toNodePath(_sourceUri), toNodePath(_targetUri), (error) => {
                if (error) {
                    return reject(error);
                }
                resolve(this.doGetStat(_targetUri, 1));
            });
        });
    }

    copy(sourceUri: string, targetUri: string, options?: { overwrite?: boolean, recursive?: boolean }): Promise<FileStat> {
        return new Promise<FileStat>((resolve, reject) => {
            const _sourceUri = toURI(sourceUri);
            const sourceStat = this.doGetStat(_sourceUri, 0);
            if (!sourceStat) {
                return reject(new Error(`File does not exist under ${sourceUri}.`));
            }
            const overwrite = this.doGetOverwrite(options);
            const _targetUri = toURI(targetUri);
            const targetStat = this.doGetStat(_targetUri, 0);
            if (targetStat && !overwrite) {
                return reject(new Error(`File already exist under the \'${targetUri}\' target location. Did you set \'overwrite\' to true?`));
            }
            fs.copy(toNodePath(_sourceUri), toNodePath(_targetUri), error => {
                if (error) {
                    return reject(error);
                }
                return resolve(this.doGetStat(_targetUri, 1));
            });
        });
    }

    createFile(uri: string, options?: { content?: string, encoding?: string }): Promise<FileStat> {
        return new Promise<FileStat>((resolve, reject) => {
            const _uri = toURI(uri);
            const stat = this.doGetStat(_uri, 0);
            if (stat) {
                return reject(new Error(`Error occurred while creating the file. File already exists at ${uri}.`));
            }
            const parentUri = _uri.parent();
            const doCreateFile = () => {
                const content = this.doGetContent(options);
                const encoding = this.doGetEncoding(options);
                fs.writeFile(toNodePath(_uri), content, { encoding }, error => {
                    if (error) {
                        return reject(error);
                    }
                    resolve(this.doGetStat(_uri, 1));
                });
            }
            if (!this.doGetStat(parentUri, 0)) {
                fs.mkdirs(toNodePath(parentUri), error => {
                    if (error) {
                        return reject(error);
                    }
                    doCreateFile();
                });
            } else {
                doCreateFile();
            }

        });
    }

    createFolder(uri: string): Promise<FileStat> {
        return new Promise<FileStat>((resolve, reject) => {
            const _uri = toURI(uri);
            const stat = this.doGetStat(_uri, 0);
            if (stat) {
                return reject(new Error(`Error occurred while creating the directory. File already exists at ${uri}.`));
            }
            fs.mkdirs(toNodePath(_uri), error => {
                if (error) {
                    return reject(error);
                }
                resolve(this.doGetStat(_uri, 1));
            });
        });
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
        return new Promise<FileStat>((resolve, reject) => {
            const stat = this.doGetStat(toURI(this.rootURI), 1);
            if (!stat) {
                return reject(new Error(`Cannot locate workspace root under ${this.rootURI}.`));
            }
            resolve(stat);
        });
    }

    protected doGetStat(uri: URI, depth: number): FileStat | undefined {
        const _uri = toNodePath(uri);
        try {
            const stat = fs.statSync(_uri);
            if (stat.isDirectory()) {
                const files = fs.readdirSync(_uri);
                let children: FileStat[] | undefined = undefined;
                if (depth > 0) {
                    children = [];
                    files.map(file => uri.append(file)).forEach(childURI => {
                        const child = this.doGetStat(childURI, depth - 1);
                        if (child) {
                            children!.push(child);
                        }
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
        } catch (error) {
            if (isErrnoException(error) && error.errno === -2 && error.code === 'ENOENT') {
                return undefined;
            }
            throw error;
        }
    }

    protected doGetEncoding(option?: { encoding?: string }): string {
        // TODO: this should fall back to the workspace default if it cannot be retrieved from the argument.
        return (option && option.encoding) || "utf8";
    }

    protected doGetOverwrite(option?: { overwrite?: boolean }): boolean {
        // TODO: this should fall back to the workspace default configuration.
        return (option && option.overwrite) || false;
    }

    protected doGetRecursive(option?: { recursive?: boolean }): boolean {
        // TODO: this should fall back to the workspace default configuration. By default recursive configuration is true.
        return (option && option.recursive) || true;
    }

    protected doGetContent(option?: { content?: string }): string {
        return (option && option.content) || "";
    }

}

function isErrnoException(error: any | NodeJS.ErrnoException): error is NodeJS.ErrnoException {
    return (<NodeJS.ErrnoException>error).code !== undefined && (<NodeJS.ErrnoException>error).errno !== undefined;
}

function toURI(uri: string): URI {
    if (!uri) {
        throw new Error('The argument \'uri\' should be specified.');
    }
    return new URI(uri);
}

function toNodePath(uri: URI): string {
    return uri.path();
}