import * as fs from "fs-extra";
import * as touch from "touch";
import { FileStat, FileSystem2, FileSystemClient } from '../common/filesystem2';
import URI from "../../application/common/uri";

export class FileSystemNode implements FileSystem2 {

    protected client: FileSystemClient | undefined

    constructor(protected rootURI: string, protected defaults: FileSystem2.Configuration = {
        encoding: "utf8",
        overwrite: false,
        recursive: true
    }) {

    }

    setClient(client: FileSystemClient) {
        this.client = client
    }

    getFileStat(uriAsString: string): Promise<FileStat> {
        const uri = new URI(uriAsString);
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
            return this.doGetStat(new URI(uri), 0) !== undefined;
        });
    }

    resolveContent(uri: string, options?: { encoding?: string }): Promise<{ stat: FileStat, content: string }> {
        return new Promise<{ stat: FileStat, content: string }>((resolve, reject) => {
            const _uri = new URI(uri);
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
            const _uri = new URI(file.uri);
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
            const _sourceUri = new URI(sourceUri);
            const sourceStat = this.doGetStat(_sourceUri, 0);
            if (!sourceStat) {
                return reject(new Error(`File does not exist under ${sourceUri}.`));
            }
            const _targetUri = new URI(targetUri);
            const overwrite = this.doGetOverwrite(options);
            const targetStat = this.doGetStat(_targetUri, 0);
            if (targetStat && !overwrite) {
                return reject(new Error(`File already exist under the \'${targetUri}\' target location. Did you set \'overwrite\' to true?`));
            }
            fs.rename(_sourceUri.path(), _targetUri.path(), (error) => {
                if (error) {
                    return reject(error);
                }
                resolve(this.doGetStat(_targetUri, 1));
            });
        });
    }

    copy(sourceUri: string, targetUri: string, options?: { overwrite?: boolean, recursive?: boolean }): Promise<FileStat> {
        return new Promise<FileStat>((resolve, reject) => {
            const _sourceUri = new URI(sourceUri);
            const sourceStat = this.doGetStat(_sourceUri, 0);
            if (!sourceStat) {
                return reject(new Error(`File does not exist under ${sourceUri}.`));
            }
            const overwrite = this.doGetOverwrite(options);
            const _targetUri = new URI(targetUri);
            const targetStat = this.doGetStat(_targetUri, 0);
            if (targetStat && !overwrite) {
                return reject(new Error(`File already exist under the \'${targetUri}\' target location. Did you set \'overwrite\' to true?`));
            }
            fs.copy(_sourceUri.path(), _targetUri.path(), error => {
                if (error) {
                    return reject(error);
                }
                return resolve(this.doGetStat(_targetUri, 1));
            });
        });
    }

    createFile(uri: string, options?: { content?: string, encoding?: string }): Promise<FileStat> {
        return new Promise<FileStat>((resolve, reject) => {
            const _uri = new URI(uri);
            const stat = this.doGetStat(_uri, 0);
            if (stat) {
                return reject(new Error(`Error occurred while creating the file. File already exists at ${uri}.`));
            }
            const parentUri = _uri.parent();
            const doCreateFile = () => {
                const content = this.doGetContent(options);
                const encoding = this.doGetEncoding(options);
                fs.writeFile(_uri.path(), content, { encoding }, error => {
                    if (error) {
                        return reject(error);
                    }
                    resolve(this.doGetStat(_uri, 1));
                });
            }
            if (!this.doGetStat(parentUri, 0)) {
                fs.mkdirs(parentUri.path(), error => {
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
            const _uri = new URI(uri);
            const stat = this.doGetStat(_uri, 0);
            if (stat) {
                return reject(new Error(`Error occurred while creating the directory. File already exists at ${uri}.`));
            }
            fs.mkdirs(_uri.path(), error => {
                if (error) {
                    return reject(error);
                }
                resolve(this.doGetStat(_uri, 1));
            });
        });
    }

    touchFile(uri: string): Promise<FileStat> {
        return new Promise<FileStat>((resolve, reject) => {
            const _uri = new URI(uri);
            const stat = this.doGetStat(_uri, 0);
            if (!stat) {
                this.createFile(uri).then(stat => {
                    resolve(stat);
                });
            } else {
                touch(_uri.path(), (error: any) => {
                    if (error) {
                        return reject(error);
                    }
                    resolve(this.doGetStat(_uri, 1));
                });
            }
        });
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
            const stat = this.doGetStat(new URI(this.rootURI), 1);
            if (!stat) {
                return reject(new Error(`Cannot locate workspace root under ${this.rootURI}.`));
            }
            resolve(stat);
        });
    }

    protected doGetStat(uri: URI, depth: number): FileStat | undefined {
        const path = uri.path();
        try {
            const stat = fs.statSync(path);
            if (stat.isDirectory()) {
                const files = fs.readdirSync(path);
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
        return (option && option.encoding) || this.defaults.encoding;
    }

    protected doGetOverwrite(option?: { overwrite?: boolean }): boolean {
        return (option && option.overwrite) || this.defaults.overwrite;
    }

    protected doGetRecursive(option?: { recursive?: boolean }): boolean {
        return (option && option.recursive) || this.defaults.recursive;
    }

    protected doGetContent(option?: { content?: string }): string {
        return (option && option.content) || "";
    }

}

function isErrnoException(error: any | NodeJS.ErrnoException): error is NodeJS.ErrnoException {
    return (<NodeJS.ErrnoException>error).code !== undefined && (<NodeJS.ErrnoException>error).errno !== undefined;
}