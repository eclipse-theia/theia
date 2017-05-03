/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as fs from "fs-extra";
import * as touch from "touch";
import * as path from "path";
import URI from "../../application/common/uri";
import { WatchOptions, FSWatcher } from "chokidar";
import { FileStat, FileSystem, FileSystemClient, FileChange, FileChangeType, FileChangesEvent } from "../common/filesystem";

const trash: (paths: Iterable<string>) => Promise<void> = require("trash");
const chokidar: { watch(paths: string | string[], options?: WatchOptions): FSWatcher } = require("chokidar");
const detectCharacterEncoding: (buffer: Buffer) => { encoding: string, confidence: number } = require("detect-character-encoding");

type EventType =
    "all" |
    "add" |
    "addDir" |
    "unlink" |
    "unlinkDir" |
    "change" |
    "error";

export class FileSystemNode implements FileSystem {

    protected client: FileSystemClient | undefined;
    private watcher: FSWatcher;

    constructor(protected rootUri: string, protected defaults: FileSystem.Configuration = {
        encoding: "utf8",
        overwrite: false,
        recursive: true,
        moveToTrash: true,
    }) {

        const _rootUri = new URI(this.rootUri);
        const stat = this.doGetStat(_rootUri, 0);
        if (!stat) {
            throw new Error(`File system root cannot be located under ${this.rootUri}.`);
        }
        if (!stat.isDirectory) {
            throw new Error(`File system root should point to a directory location. URI: ${this.rootUri}.`);
        }
        const rootPath = _rootUri.path();
        this.watcher = chokidar.watch(rootPath).on("all", (eventType: EventType, filename: string) => {
            if (this.client) {
                const changeType = this.getFileChangeType(eventType);
                if (changeType && typeof filename === "string") {
                    const segments = path.normalize(path.relative(_rootUri.path(), filename));
                    const changedUri = segments === "." ? rootUri : _rootUri.append(segments);
                    const change = new FileChange(changedUri.toString(), changeType);
                    const event = new FileChangesEvent([change]);
                    this.client.onFileChanges(event);
                }
            }
        });
    }

    setClient(client: FileSystemClient | undefined) {
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
            this.doCheckStat(file).then(stat => {
                const _uri = new URI(stat.uri);
                const encoding = this.doGetEncoding(options);
                fs.writeFile(_uri.path(), content, encoding, error => {
                    if (error) {
                        return reject(error);
                    }
                    resolve(this.doGetStat(_uri, 1));
                });
            }).catch(error => {
                reject(error);
            });
        });
    }

    move(sourceStat: FileStat, targetUri: string, options?: { overwrite?: boolean }): Promise<FileStat> {
        return new Promise<FileStat>((resolve, reject) => {
            this.doCheckStat(sourceStat).then(stat => {
                const _targetUri = new URI(targetUri);
                const overwrite = this.doGetOverwrite(options);
                const targetStat = this.doGetStat(_targetUri, 0);
                if (targetStat && !overwrite) {
                    return reject(new Error(`File already exist under the \'${targetUri}\' target location.`));
                }
                fs.rename(new URI(stat.uri).path(), _targetUri.path(), (error) => {
                    if (error) {
                        return reject(error);
                    }
                    resolve(this.doGetStat(_targetUri, 1));
                });
            }).catch(error => {
                reject(error);
            });
        });
    }

    copy(sourceStat: FileStat, targetUri: string, options?: { overwrite?: boolean, recursive?: boolean }): Promise<FileStat> {
        return new Promise<FileStat>((resolve, reject) => {
            this.doCheckStat(sourceStat).then(stat => {
                const _targetUri = new URI(targetUri);
                const overwrite = this.doGetOverwrite(options);
                const targetStat = this.doGetStat(_targetUri, 0);
                if (targetStat && !overwrite) {
                    return reject(new Error(`File already exist under the \'${targetUri}\' target location.`));
                }
                fs.copy(new URI(stat.uri).path(), _targetUri.path(), error => {
                    if (error) {
                        return reject(error);
                    }
                    return resolve(this.doGetStat(_targetUri, 1));
                });
            }).catch(error => {
                reject(error);
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

    delete(file: FileStat, options?: { moveToTrash?: boolean }): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this.doCheckStat(file).then(stat => {
            const moveToTrash = this.doGetMoveToTrash(options);
            if (moveToTrash) {
                resolve(trash([new URI(stat.uri).path()]));
            } else {
                fs.remove(new URI(stat.uri).path(), error => {
                    if (error) {
                        return reject(error);
                    }
                });
            }
            }).catch(error => {
                reject(error);
            })
        });
    }

    watchFileChanges(uri: string): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const _uri = new URI(uri);
            const stat = this.doGetStat(_uri, 0);
            if (!stat) {
                return reject(new Error(`File does not exist under ${uri}.`));
            }
            this.watcher.add(_uri.path());
        });
    }

    unwatchFileChanges(uri: string): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const _uri = new URI(uri);
            const stat = this.doGetStat(_uri, 0);
            if (!stat) {
                return reject(new Error(`File does not exist under ${uri}.`));
            }
            this.watcher.unwatch(_uri.path());
        });
    }

    getEncoding(uri: string, options?: { preferredEncoding?: string }): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            const _uri = new URI(uri);
            const stat = this.doGetStat(_uri, 0);
            if (!stat) {
                return reject(new Error(`File does not exist under ${uri}.`));
            }
            if (stat.isDirectory) {
                return reject(new Error(`Cannot get the encoding of a director. URI: ${uri}.`));
            }
            fs.readFile(_uri.path(), {}, (error, buffer) => {
                if (error) {
                    return reject(error);
                }
                const encoding = detectCharacterEncoding(buffer);
                if (encoding && encoding.encoding) {
                    resolve(encoding.encoding);
                } else {
                    resolve(options && typeof (options.preferredEncoding) !== "undefined" ? options.preferredEncoding : this.defaults.encoding);
                }
            });
        });
    }

    getWorkspaceRoot(): Promise<FileStat> {
        return new Promise<FileStat>((resolve, reject) => {
            const stat = this.doGetStat(new URI(this.rootUri), 1);
            if (!stat) {
                return reject(new Error(`Cannot locate workspace root under ${this.rootUri}.`));
            }
            resolve(stat);
        });
    }

    dispose(): void {
        this.watcher.close();
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
                    size: stat.size,
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
            if (isErrnoException(error) && error.errno === -2 && error.code === "ENOENT") {
                return undefined;
            }
            throw error;
        }
    }

    protected doGetEncoding(option?: { encoding?: string }): string {
        return option && typeof (option.encoding) !== "undefined"
            ? option.encoding
            : this.defaults.encoding;
    }

    protected doGetOverwrite(option?: { overwrite?: boolean }): boolean {
        return option && typeof (option.overwrite) !== "undefined"
            ? option.overwrite
            : this.defaults.overwrite;
    }

    protected doGetRecursive(option?: { recursive?: boolean }): boolean {
        return option && typeof (option.recursive) !== "undefined"
            ? option.recursive
            : this.defaults.recursive;
    }

    protected doGetMoveToTrash(option?: { moveToTrash?: boolean }): boolean {
        return option && typeof (option.moveToTrash) !== "undefined"
            ? option.moveToTrash
            : this.defaults.moveToTrash;
    }

    protected doGetContent(option?: { content?: string }): string {
        return (option && option.content) || "";
    }

    protected doCheckStat(stat: FileStat): Promise<FileStat> {
        return new Promise<FileStat>((resolve, reject) => {
            const { uri, lastModification, size } = stat;
            const expectedStat = this.doGetStat(new URI(uri.toString()), 0);
            if (!expectedStat) {
                return reject(new Error(`File does not exist under ${uri}.`));
            }
            if (expectedStat.lastModification !== lastModification) {
                return reject(new Error(`File is out of sync. URI: ${uri}. Expected timestamp: ${lastModification}. Actual timestamp: ${expectedStat.lastModification}.`));
            }
            if (expectedStat.size !== size) {
                return reject(new Error(`File is out of sync. URI: ${uri}. Expected size: ${size}. Actual size: ${expectedStat.size}.`));
            }
            resolve(stat);
        });
    }

    private getFileChangeType(eventType: EventType): FileChangeType | undefined {
        switch (eventType) {
            case "add":
            case "addDir":
                return FileChangeType.ADDED;
            case "unlink":
            case "unlinkDir":
                return FileChangeType.DELETED;
            case "change":
                return FileChangeType.UPDATED;
            case "error":
                return undefined;
            default:
                throw new Error(`Unexpected file change event type: ${event}.`);
        }
    }

}

function isErrnoException(error: any | NodeJS.ErrnoException): error is NodeJS.ErrnoException {
    return (<NodeJS.ErrnoException>error).code !== undefined && (<NodeJS.ErrnoException>error).errno !== undefined;
}