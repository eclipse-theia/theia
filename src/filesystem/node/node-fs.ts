import * as fs from "fs";
import { Disposable } from "../../application/common";
import { FileSystem, FileSystemWatcher, FileChangeType, FileChange, FileChangeEvent, Path } from "../common";

export class NodeFileSystem implements FileSystem {

    private readonly watchers: FileSystemWatcher[];

    constructor(private root: Path) {
        this.watchers = [];
    }

    ls(raw: Path): Promise<Path[]> {
        if (!raw) {
            return Promise.reject([]);
        }
        const path = this.toPath(raw);
        return new Promise<Path[]>((resolve, reject) => {
            fs.readdir(path, (err, files) => {
                if (err) {
                    if (err.errno === -20 && err.code === 'ENOTDIR') {
                        reject([]);
                    } else {
                        reject(err);
                    }
                } else {
                    resolve(files.map(file => raw.append(file)));
                }
            });
        });
    }

    chmod(raw: Path, mode: number): Promise<boolean> {
        if (!raw || !mode) {
            return Promise.reject(false);
        }
        const path = this.toPath(raw);
        return new Promise<boolean>((resolve, reject) => {
            fs.chmod(path, mode, (err) => {
                if (err) {
                    reject(false);
                } else {
                    resolve(true);
                }
            });
        });
    }

    public mkdir(raw: Path, mode: number = parseInt('0777', 8)): Promise<boolean> {
        if (!raw) {
            return Promise.reject(false);
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

    public rename(oldRaw: Path, newRaw: Path): Promise<boolean> {
        if (!oldRaw || !newRaw) {
            return Promise.reject(false);
        }
        const oldPath = this.toPath(oldRaw);
        const newPath = this.toPath(newRaw);
        return new Promise<boolean>((resolve, reject) => {
            fs.rename(oldPath, newPath, (err) => {
                if (err) {
                    reject(false);
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

    public rmdir(raw: Path): Promise<boolean> {
        if (!raw) {
            return Promise.reject(false);
        }
        const path = this.toPath(raw);
        return new Promise<boolean>((resolve, reject) => {
            fs.rmdir(path, (err) => {
                if (err) {
                    reject(false);
                } else {
                    this.notify(path, FileChangeType.DELETED);
                    resolve(true);
                }
            });
        });
    }

    public rm(raw: Path): Promise<boolean> {
        if (!raw) {
            return Promise.reject(false);
        }
        const path = this.toPath(raw);
        return new Promise<boolean>((resolve, reject) => {
            fs.unlink(path, (err) => {
                if (err) {
                    reject(err);
                } else {
                    this.notify(raw, FileChangeType.DELETED);
                    resolve(true);
                }
            });
        });
    }

    public readFile(raw: Path, encoding: string): Promise<string> {
        if (!raw || !encoding) {
            return Promise.reject(`Cannot read file content. File path: ${raw}. Encoding: ${encoding}.`);
        }
        const path = this.toPath(raw);
        return new Promise<string>((resolve, reject) => {
            fs.readFile(path, encoding, (err, data) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(data);
                }
            });
        });
    }

    public writeFile(raw: Path, data: string, encoding: string = 'utf8'): Promise<boolean> {
        if (!raw || !data) {
            return Promise.reject(false);
        }
        const path = this.toPath(raw);
        return new Promise<boolean>((resolve, reject) => {
            fs.writeFile(path, data, (err) => {
                if (err) {
                    reject(err);
                } else {
                    this.notify(path, FileChangeType.UPDATED);
                    resolve(true);
                }
            });
        });
    }

    public exists(raw: Path): Promise<boolean> {
        if (!raw) {
            return Promise.reject(false);
        }
        const path = this.toPath(raw);
        return new Promise<boolean>((resolve) => {
            fs.exists(path, (exist) => {
                resolve(exist);
            });
        });
    }

    public dirExists(raw: Path): Promise<boolean> {
        return new Promise<boolean>((resolve, reject) => {
            this.exists(raw).then(() => {
                const path = this.toPath(raw);
                fs.stat(path, (err, stat) => {
                    if (err) {
                        if (err.errno === -2 && err.code === 'ENOENT') {
                            resolve(false);
                        } else {
                            reject(err);
                        }
                    } else {
                        resolve(stat.isDirectory());
                    }
                })
            })
        });
    }

    public fileExists(raw: Path): Promise<boolean> {
        return new Promise<boolean>((resolve, reject) => {
            this.exists(raw).then(() => {
                const path = this.toPath(raw);
                fs.stat(path, (err, stat) => {
                    if (err) {
                        if (err.errno === -2 && err.code === 'ENOENT') {
                            resolve(false);
                        } else {
                            reject(err);
                        }
                    } else {
                        resolve(stat.isFile());
                    }
                })
            })
        });
    }

    public watch(watcher: FileSystemWatcher): Disposable {
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

    private toPath(raw: Path): string {
        return this.resolve(raw).toString();
    }

    private resolve(raw: Path): Path {
        return this.root.resolve(raw);
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