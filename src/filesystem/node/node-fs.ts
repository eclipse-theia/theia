import * as fs from "fs";
import {Disposable} from "../../application/common";
import {FileSystem, FileSystemWatcher, FileChangeType, FileChange, FileChangeEvent, Path} from "../common";

export class NodeFileSystem implements FileSystem {

    private readonly watchers: FileSystemWatcher[];

    constructor(private root: Path) {
        this.watchers = [];
    }

    public isRoot(path: Path): boolean {
        return path ? this.root.equals(path) : false;
    }

    public ls(path: Path): Promise<Path[]> {
        if (path) {
            const pathString = path.toString();
            if (pathString) {
                return new Promise<Path[]>((resolve, reject) => {
                    fs.readdir(pathString, (err, files) => {
                        if (err) {
                            if (err.errno === -20 && err.code === 'ENOTDIR') {
                                resolve([]);
                            } else {
                                reject(err);
                            }
                        } else {
                            resolve(files.map(file => path.append(file)));
                        }
                    });
                });
            }
        }
        return Promise.resolve([]);
    }

    public chmod(path: Path, mode: number): Promise<boolean> {
        if (path && mode) {
            const pathString = path.toString();
            if (pathString) {
                return new Promise<boolean>((resolve, reject) => {
                    fs.chmod(pathString, mode, (err) => {
                        if (err) {
                            reject(false);
                        } else {
                            resolve(true);
                        }
                    });
                });
            }
        }
        return Promise.resolve(false);
    }

    public mkdir(path: Path, mode: number = parseInt('0777', 8)): Promise<boolean> {
        if (path) {
            const pathString = path.toString();
            if (pathString) {
                return new Promise<boolean>((resolve, reject) => {
                    fs.mkdir(pathString, mode, (err) => {
                        if (err) {
                            reject(err);
                        } else {
                            this.notify(path, FileChangeType.ADDED);
                            resolve(true);
                        }
                    });
                });
            }
        }
        return Promise.resolve(false);
    }

    public rename(oldPath: Path, newPath: Path): Promise<boolean> {
        if (oldPath && newPath) {
            const oldPathString = oldPath.toString();
            const newPathString = newPath.toString();
            if (oldPathString && newPathString) {
                return new Promise<boolean>((resolve, reject) => {
                    fs.rename(oldPathString, newPathString, (err) => {
                        if (err) {
                            reject(false);
                        } else {
                            this.fireEvent(new FileChangeEvent([
                                new FileChange(oldPath, FileChangeType.DELETED),
                                new FileChange(newPath, FileChangeType.ADDED)
                            ]));
                            resolve(true);
                        }
                    });
                    // this.exists(newPath).then(exist => {
                    //     if (!exist) {
                    //     } else {
                    //         reject(false);
                    //     }
                    // });
                });
            }
        }
        return Promise.resolve(false);
    }

    public rmdir(path: Path): Promise<boolean> {
        if (path) {
            const pathString = path.toString();
            if (pathString) {
                return new Promise<boolean>((resolve, reject) => {
                    fs.rmdir(pathString, (err) => {
                        if (err) {
                            reject(false);
                        } else {
                            this.notify(path, FileChangeType.DELETED);
                            resolve(true);
                        }
                    });
                });
            }
        }
        return Promise.resolve(false);
    }

    public rm(path: Path): Promise<boolean> {
        if (path) {
            const pathString = path.toString();
            if (pathString) {
                return new Promise<boolean>((resolve, reject) => {
                    fs.unlink(pathString, (err) => {
                        if (err) {
                            reject(err);
                        } else {
                            this.notify(path, FileChangeType.DELETED);
                            resolve(true);
                        }
                    });
                });
            }
        }
        return Promise.resolve(false);
    }

    public readFile(path: Path, encoding: string): Promise<string> {
        if (path && encoding) {
            const pathString = path.toString();
            if (pathString) {
                return new Promise<string>((resolve, reject) => {
                    fs.readFile(pathString, encoding, (err, data) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve(data);
                        }
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
                    fs.writeFile(pathString, data, (err) => {
                        if (err) {
                            reject(err);
                        } else {
                            this.notify(path, FileChangeType.UPDATED);
                            resolve(true);
                        }
                    });
                });
            }
        }
        return Promise.resolve(false);
    }

    public exists(path: Path): Promise<boolean> {
        if (path) {
            const pathString = path.toString();
            if (pathString) {
                return new Promise<boolean>((resolve) => {
                    fs.exists(pathString, (exist) => {
                        resolve(exist);
                    });
                });
            }
        }
        return Promise.resolve(false);
    }

    public dirExists(path: Path): Promise<boolean> {
        return new Promise<boolean>((resolve, reject) => {
            this.exists(path).then(() => {
                fs.stat(path.toString(), (err, stat) => {
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

    public fileExists(path: Path): Promise<boolean> {
        return new Promise<boolean>((resolve, reject) => {
            this.exists(path).then(() => {
                fs.stat(path.toString(), (err, stat) => {
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

    private notify(path: Path, changeType: FileChangeType): void {
        const change = new FileChange(path, changeType);
        this.fireEvent(new FileChangeEvent([change]))
    }

    private fireEvent(event: FileChangeEvent) {
        this.watchers.forEach(watcher => watcher(event));
    }

}