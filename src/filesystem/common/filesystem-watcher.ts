/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from "inversify";
import { Emitter, Event } from '../../application/common';

@injectable()
export class FileSystemWatcher {

    getFileSystemClient(): FileSystemClient {
        const emitter = this.onFileChangesEmitter
        return {
            onFileChanges(event: FileChangesEvent) {
                emitter.fire(event)
            }
        }
    }

    private onFileChangesEmitter = new Emitter<FileChangesEvent>();

    get onFileChanges(): Event<FileChangesEvent> {
        return this.onFileChangesEmitter.event;
    }
}

export interface FileSystemClient {
    /**
     * Notifies about file changes
     */
    onFileChanges(event: FileChangesEvent): void
}

export class FileChangesEvent {
    constructor(public readonly changes: FileChange[]) { }
}

export class FileChange {

    constructor(
        public readonly uri: string,
        public readonly type: FileChangeType) { }

    equals(other: any): boolean {
        return other instanceof FileChange && other.type === this.type && other.uri === this.uri;
    }

}

export enum FileChangeType {
    UPDATED = 0,
    ADDED = 1,
    DELETED = 2
}
