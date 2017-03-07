import * as fs from "fs";
import {FileSystem, FileSystemWatcher, FileChangeType, FileChangeEvent} from "../../../lib/filesystem/common/file-system";
import {Path} from "../../../lib/filesystem/common/path";
import {Disposable} from "../../../lib/application/common/disposable";
import {FileChange} from "../common/file-system";

export class NodeFileSystem implements FileSystem {

    private readonly watchers: FileSystemWatcher[];

    constructor(private root: Path) {
        this.watchers = [];
    }

    public isRoot(path: Path): boolean {
        return this.root.equals(path);
    }

    public ls(path: Path): Promise<Path[]> {

        if (path) {
            const pathString = path.toString();
            if (pathString) {
                return new Promise<Path[]>((resolve, reject) => {
                    fs.readdir(pathString, (err: any, files: string[]) => {
                        if (err) {
                            return reject([]);
                        }
                        return resolve(files.map(file => Path.fromString(file)));
                    });
                });
            }
        }
        return Promise.reject([]);
    }

    public chmod(path: Path, mode: number): Promise<boolean> {
        if (path && mode) {
            const pathString = path.toString();
            if (pathString) {
                return new Promise<boolean>((resolve, reject) => {
                    fs.chmod(pathString, mode, (err: any) => {
                        if (err) {
                            return reject(false);
                        }
                        return resolve(true);
                    });
                });
            }
        }
        return Promise.reject(false);
    }

    public mkdir(path: Path, mode: number = parseInt('0777', 8)): Promise<boolean> {
        if (path) {
            const pathString = path.toString();
            if (pathString) {
                return new Promise<boolean>((resolve, reject) => {
                    fs.mkdir(pathString, mode, (err: any) => {
                        if (err) {
                            reject(err);
                        }
                        else {
                            this.notify(path, FileChangeType.ADDED);
                            resolve(true);
                        }
                    });
                });
            }
        }
        return Promise.reject(false);
    }

    public rename(oldPath: Path, newPath: Path): Promise<boolean> {
        if (oldPath && newPath) {
            const oldPathString = oldPath.toString();
            const newPathString = newPath.toString();
            if (oldPathString && newPathString) {
                return new Promise<boolean>((resolve, reject) => {
                    fs.rename(oldPathString, newPathString, (err: any) => {
                        if (err) {
                            return reject(false);
                        }
                        this.notify(oldPath, FileChangeType.DELETED);
                        this.notify(newPath, FileChangeType.ADDED);
                        return resolve(true);
                    });
                });
            }
        }
        return Promise.reject(false);
    }

    public rmdir(path: Path): Promise<boolean> {
        if (path) {
            const pathString = path.toString();
            if (pathString) {
                return new Promise<boolean>((resolve, reject) => {
                    fs.rmdir(pathString, (err: any) => {
                        if (err) {
                            return reject(false);
                        }
                        this.notify(path, FileChangeType.DELETED);
                        return resolve(true);
                    });
                });
            }
        }
        return Promise.reject(false);
    }

    public rm(path: Path): Promise<boolean> {
        if (path) {
            const pathString = path.toString();
            if (pathString) {
                return new Promise<boolean>((resolve, reject) => {
                    fs.unlink(pathString, (err: any) => {
                        if (err) {
                            return reject(err);
                        }
                        this.notify(path, FileChangeType.DELETED);
                        return resolve(true);
                    });
                });
            }
        }
        return Promise.reject(false);
    }

    public readFile(path: Path, encoding: string): Promise<string> {
        if (path && encoding) {
            const pathString = path.toString();
            if (pathString) {
                return new Promise<string>((resolve, reject) => {
                    fs.readFile(pathString, encoding, (err: any, data: string) => {
                        if (err) {
                            return reject(err);
                        }
                        return resolve(data);
                    });
                });
            }
        }
        return Promise.reject(`Cannot read file content. File path: ${path}. Encoding: ${encoding}.`);
    }

    public writeFile(path: Path, data: string, encoding?: string): Promise<boolean> {
        if (path && data) {
            const pathString = path.toString();
            if (pathString) {
                return new Promise<boolean>((resolve, reject) => {
                    fs.writeFile(pathString, data, (err: any) => {
                        if (err) {
                            return reject(err);
                        }
                        this.notify(path, FileChangeType.UPDATED);
                        return resolve(true);
                    });
                });
            }
        }
        return Promise.reject(false);
    }

    public exists(path: Path): Promise<boolean> {
        if (path) {
            const pathString = path.toString();
            if (pathString) {
                return new Promise<boolean>((resolve) => {
                    fs.exists(pathString, (exist: boolean) => {
                        resolve(exist);
                    });
                });
            }
        }
        return Promise.reject(false);
    }

    public dirExists(path: Path): Promise<boolean> {
        return new Promise<boolean>((resolve, reject) => {
            this.exists(path).then(exist => {
                fs.stat(path.toString(), (err, stat) => {
                    if (err) {
                        reject(err);
                    }
                    return resolve(stat.isDirectory());
                })
            })
        });
    }

    public fileExists(path: Path): Promise<boolean> {
        return new Promise<boolean>((resolve, reject) => {
            this.exists(path).then(exist => {
                fs.stat(path.toString(), (err, stat) => {
                    if (err) {
                        reject(err);
                    }
                    return resolve(stat.isFile());
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

    private notify(path: Path, changeType: FileChangeType): void {
        const change = new FileChange(path, changeType);
        const event = new FileChangeEvent([change]);
        this.watchers.forEach(watcher => watcher(event));
    }

}