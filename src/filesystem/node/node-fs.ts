import * as fs from "fs";
import * as nodePath from "path";
import { Disposable } from "../../application/common";
import { FileSystem, FileSystemWatcher, FileChangeType, FileChange, FileChangeEvent, Path } from "../common";

const BLANK_NAME_TEMPLATE = 'Untitled ';

export class NodeFileSystem implements FileSystem {

    private readonly watchers: FileSystemWatcher[];

    constructor(private root: Path) {
        this.watchers = [];
    }

    ls(raw: Path): Promise<Path[]> {
        if (!raw) {
            return Promise.reject(new Error('The path argument \'raw\' should be specified.'));
        }
        const path = this.toPath(raw);
        return new Promise<Path[]>((resolve, reject) => {
            fs.readdir(path, (err, files) => {
                if (err) {
                    return reject(err);
                }
                resolve(files.map(file => raw.append(file)));
            });
        });
    }

    chmod(raw: Path, mode: number): Promise<boolean> {
        if (!raw || !mode) {
            return Promise.reject(new Error('The path arguments \'raw\' and \'mode\' should specified.'));
        }
        const path = this.toPath(raw);
        return new Promise<boolean>((resolve, reject) => {
            fs.chmod(path, mode, (err) => {
                if (err) {
                    return reject(err);
                }
                resolve(true);
            });
        });
    }

    mkdir(raw: Path, mode: number = parseInt('0777', 8)): Promise<boolean> {
        if (!raw) {
            return Promise.reject(new Error('The path argument \'raw\' should be specified.'));
        }
        const path = this.toPath(raw);
        return new Promise<boolean>((resolve, reject) => {
            fs.mkdir(path, mode, (err) => {
                if (err) {
                    reject(err);
                } else {
                    this.notify(raw, FileChangeType.ADDED);
                    resolve(true);
                }
            });
        });
    }

    rename(oldRaw: Path, newRaw: Path): Promise<boolean> {
        if (!oldRaw || !newRaw) {
            return Promise.reject(new Error('The path arguments \'oldRaw\' and \'newRaw\' paths should specified.'));
        }
        const oldPath = this.toPath(oldRaw);
        const newPath = this.toPath(newRaw);
        return new Promise<boolean>((resolve, reject) => {
            fs.rename(oldPath, newPath, (err) => {
                if (err) {
                    reject(err);
                } else {
                    this.fireEvent(new FileChangeEvent([
                        this.createFileChange(oldRaw, FileChangeType.DELETED),
                        this.createFileChange(newRaw, FileChangeType.ADDED)
                    ]));
                    resolve(true);
                }
            });
        });
    }

    rmdir(raw: Path): Promise<boolean> {
        if (!raw) {
            return Promise.reject(new Error('The path argument \'raw\' should be specified.'));
        }
        const path = this.toPath(raw);
        return new Promise<boolean>((resolve, reject) => {
            this.clearDir(path).then((result) => {
                fs.rmdir(path, (err) => {
                    if (err) {
                        return reject(err);
                    }
                    result.push(path);
                    const changes = result.map(filePath => this.createFileChange(this.deresolve(filePath), FileChangeType.DELETED));
                    this.fireEvent(new FileChangeEvent(changes));
                    resolve(true);
                });
            }, (err) => {
                reject(err);
            });
        });
    }

    rm(raw: Path): Promise<boolean> {
        if (!raw) {
            return Promise.reject(new Error('The path argument \'raw\' should be specified.'));
        }
        const path = this.toPath(raw);
        return new Promise<boolean>((resolve, reject) => {
            fs.unlink(path, (err) => {
                if (err) {
                    return reject(err);
                }
                this.notify(raw, FileChangeType.DELETED);
                resolve(true);
            });
        });
    }

    readFile(raw: Path, encoding: string = 'utf8'): Promise<string> {
        if (!raw) {
            return Promise.reject(new Error('The path argument \'raw\' should be specified.'));
        }
        const path = this.toPath(raw);
        return new Promise<string>((resolve, reject) => {
            fs.readFile(path, encoding, (err, data) => {
                if (err) {
                    return reject(err);
                }
                resolve(data);
            });
        });
    }

    writeFile(raw: Path, data: string, encoding: string = 'utf8'): Promise<boolean> {
        if (!raw || data == null) {
            return Promise.reject(new Error(`Cannot write file content. File path: ${raw}. Content: ${data}. Encoding: ${encoding}.`));
        }
        const path = this.toPath(raw);
        return new Promise<boolean>((resolve, reject) => {
            fs.writeFile(path, data, encoding, (err) => {
                if (err) {
                    return reject(err);
                }
                this.notify(path, FileChangeType.UPDATED);
                resolve(true);
            });
        });
    }

    exists(raw: Path): Promise<boolean> {
        if (!raw) {
            return Promise.reject(new Error('The path argument \'raw\' should be specified.'));
        }
        const path = this.toPath(raw);
        return new Promise<boolean>((resolve) => {
            fs.exists(path, (exist) => {
                resolve(exist);
            });
        });
    }

    dirExists(raw: Path): Promise<boolean> {
        return this.resourceExists(raw, (stat: fs.Stats) => stat.isDirectory());
    }

    fileExists(raw: Path): Promise<boolean> {
        return this.resourceExists(raw, (stat: fs.Stats) => stat.isFile());
    }

    createName(raw: Path): Promise<string> {
        return this.fileExists(raw)
        .then((exists: boolean) => {
            if (exists) {
                return this.createName(raw.parent)
            }
            return this.dirExists(raw)
            .then((exists: boolean) => {
                if (!exists) {
                    return Promise.reject<string>(new Error('The directory does not exist.'));
                }
                let num = 1;
                let tryNum = (): Promise<string> => {
                    let curName: string = `${BLANK_NAME_TEMPLATE} ${num}`;
                    let newPath: Path = raw.append(curName)
                    return this.exists(newPath)
                    .then((exists: boolean) => {
                        if (exists) {
                            num++
                            return tryNum()
                        }
                        return Promise.resolve(newPath.toString())
                    })
                }
                return tryNum()
            })
        })
    }

    watch(watcher: FileSystemWatcher): Disposable {
        if (!watcher) {
            throw new Error('File watcher should be specified.');
        }
        this.watchers.push(watcher);
        return {
            dispose: () => {
                const index = this.watchers.indexOf(watcher);
                if (index >= 0) {
                    this.watchers.splice(index, 1);
                }
            }
        };
    }

    private clearDir(path: string, deletedPaths: string[] = []): Promise<string[]> {
        return new Promise<string[]>((resolve, reject) => {
            fs.readdir(path, (err, filePaths) => {
                if (err) {
                    return reject(err);
                }
                Promise.all(filePaths.map(filePath => this.clearResource(this.join(path, filePath), deletedPaths))).then(() => {
                    resolve(deletedPaths);
                });
            });
        });
    }

    private clearResource(path: string, deletedPaths: string[]): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            fs.stat(path, (err, stats) => {
                if (err) {
                    return reject(err);
                }
                if (stats.isFile()) {
                    fs.unlink(path, (err) => {
                        if (err) {
                            return reject(err);
                        }
                        deletedPaths.push(path);
                        resolve(path);
                    })
                } else if (stats.isDirectory()) {
                    this.clearDir(path, deletedPaths).then(() => {
                        fs.rmdir(path, (err) => {
                            if (err) {
                                return reject(err);
                            }
                            deletedPaths.push(path);
                            resolve(path);
                        })
                    })
                } else {
                    reject(new Error(`Unexpected file stats: ${stats} for path: ${path}.`));
                }
            })
        });
    }

    private resourceExists(raw: Path, cb: (stats: fs.Stats) => boolean): Promise<boolean> {
        return new Promise<boolean>((resolve, reject) => {
            this.exists(raw).then(exist => {
                if (!exist) {
                    return resolve(false);
                }
                const path = this.toPath(raw);
                fs.stat(path, (err, stat) => {
                    if (err) {
                        if (err.errno === -2 && err.code === 'ENOENT') {
                            resolve(false);
                        } else {
                            reject(err);
                        }
                    } else {
                        resolve(cb(stat));
                    }
                })
            }, err => {
                reject(err);
            });
        });
    }

    private toPath(raw: Path): string {
        return this.resolve(raw).toString();
    }

    private resolve(raw: Path): Path {
        return this.root.resolve(raw);
    }

    private deresolve(path: string): Path {
        return Path.fromString(nodePath.relative(this.root.toString(), path));
    }

    private join(first: string, second: string, ...rest: string[]) {
        if (!first || !second) {
            throw new Error('Segments should be specified.');
        }
        const segments = rest || [];
        segments.unshift(second);
        segments.unshift(first);
        return segments.join('/');
    }

    private createFileChange(raw: string | Path, changeType: FileChangeType): FileChange {
        return new FileChange(raw instanceof Path ? raw : Path.fromString(raw), changeType);
    }

    private notify(raw: string | Path, changeType: FileChangeType): void {
        this.fireEvent(new FileChangeEvent([this.createFileChange(raw, changeType)]))
    }

    private fireEvent(event: FileChangeEvent) {
        this.watchers.forEach(watcher => watcher(event));
    }

}
