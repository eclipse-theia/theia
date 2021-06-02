/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { Emitter, WaitUntilEvent } from '@theia/core/lib/common/event';
import URI from '@theia/core/lib/common/uri';
import { FileChangeType, FileOperation } from '../common/files';
import { FileService } from './file-service';

export {
    FileChangeType
};

export interface FileChange {
    uri: URI;
    type: FileChangeType;
}
export namespace FileChange {
    export function isUpdated(change: FileChange, uri: URI): boolean {
        return change.type === FileChangeType.UPDATED && uri.toString() === change.uri.toString();
    }
    export function isAdded(change: FileChange, uri: URI): boolean {
        return change.type === FileChangeType.ADDED && uri.toString() === change.uri.toString();
    }
    export function isDeleted(change: FileChange, uri: URI): boolean {
        return change.type === FileChangeType.DELETED && change.uri.isEqualOrParent(uri);
    }
    export function isAffected(change: FileChange, uri: URI): boolean {
        return isDeleted(change, uri) || uri.toString() === change.uri.toString();
    }
    export function isChanged(change: FileChange, uri: URI): boolean {
        return !isDeleted(change, uri) && uri.toString() === change.uri.toString();
    }
}

/**
 * @deprecated since 1.4.0 - in order to support VS Code FS API (https://github.com/eclipse-theia/theia/pull/7908), use `FileChangesEvent` instead
 */
export type FileChangeEvent = FileChange[];
export namespace FileChangeEvent {
    export function isUpdated(event: FileChangeEvent, uri: URI): boolean {
        return event.some(change => FileChange.isUpdated(change, uri));
    }
    export function isAdded(event: FileChangeEvent, uri: URI): boolean {
        return event.some(change => FileChange.isAdded(change, uri));
    }
    export function isDeleted(event: FileChangeEvent, uri: URI): boolean {
        return event.some(change => FileChange.isDeleted(change, uri));
    }
    export function isAffected(event: FileChangeEvent, uri: URI): boolean {
        return event.some(change => FileChange.isAffected(change, uri));
    }
    export function isChanged(event: FileChangeEvent, uri: URI): boolean {
        return !isDeleted(event, uri) && event.some(change => FileChange.isChanged(change, uri));
    }
}

/**
 * @deprecated since 1.4.0 - in order to support VS Code FS API (https://github.com/eclipse-theia/theia/pull/7908), use `UserFileOperationEvent` instead
 */
export interface FileMoveEvent extends WaitUntilEvent {
    sourceUri: URI
    targetUri: URI
}
export namespace FileMoveEvent {
    export function isRename({ sourceUri, targetUri }: FileMoveEvent): boolean {
        return sourceUri.parent.toString() === targetUri.parent.toString();
    }
}

/**
 * @deprecated since 1.4.0 - in order to support VS Code FS API (https://github.com/eclipse-theia/theia/pull/7908), use `UserFileOperationEvent` instead
 */
export interface FileEvent extends WaitUntilEvent {
    uri: URI
}

export class FileOperationEmitter<E extends WaitUntilEvent> implements Disposable {

    protected readonly onWillEmitter = new Emitter<E>();
    readonly onWill = this.onWillEmitter.event;

    protected readonly onDidFailEmitter = new Emitter<E>();
    readonly onDidFail = this.onDidFailEmitter.event;

    protected readonly onDidEmitter = new Emitter<E>();
    readonly onDid = this.onDidEmitter.event;

    protected readonly toDispose = new DisposableCollection(
        this.onWillEmitter,
        this.onDidFailEmitter,
        this.onDidEmitter
    );

    dispose(): void {
        this.toDispose.dispose();
    }

    async fireWill(event: Pick<E, Exclude<keyof E, 'waitUntil'>>): Promise<void> {
        await WaitUntilEvent.fire(this.onWillEmitter, event);
    }

    async fireDid(failed: boolean, event: Pick<E, Exclude<keyof E, 'waitUntil'>>): Promise<void> {
        const onDidEmitter = failed ? this.onDidFailEmitter : this.onDidEmitter;
        await WaitUntilEvent.fire(onDidEmitter, event);
    }

}

/**
 * React to file system events, including calls originating from the
 * application or event coming from the system's filesystem directly
 * (actual file watching).
 *
 * `on(will|did)(create|rename|delete)` events solely come from application
 * usage, not from actual filesystem.
 *
 * @deprecated since 1.4.0 - in order to support VS Code FS API (https://github.com/eclipse-theia/theia/pull/7908), use `FileService.watch` instead
 */
@injectable()
export class FileSystemWatcher implements Disposable {

    protected readonly toDispose = new DisposableCollection();
    protected readonly toRestartAll = new DisposableCollection();

    protected readonly onFileChangedEmitter = new Emitter<FileChangeEvent>();
    /**
     * @deprecated since 1.4.0 - in order to support VS Code FS API (https://github.com/eclipse-theia/theia/pull/7908), use `FileService.onDidFilesChange` instead
     */
    readonly onFilesChanged = this.onFileChangedEmitter.event;

    protected readonly fileCreateEmitter = new FileOperationEmitter<FileEvent>();
    /**
     * @deprecated since 1.4.0 - in order to support VS Code FS API (https://github.com/eclipse-theia/theia/pull/7908), use `FileService.onWillRunUserOperation` instead
     */
    readonly onWillCreate = this.fileCreateEmitter.onWill;
    /**
     * @deprecated since 1.4.0 - in order to support VS Code FS API (https://github.com/eclipse-theia/theia/pull/7908), use `FileService.onDidFailUserOperation` instead
     */
    readonly onDidFailCreate = this.fileCreateEmitter.onDidFail;
    /**
     * @deprecated since 1.4.0 - in order to support VS Code FS API (https://github.com/eclipse-theia/theia/pull/7908),
     * instead use `FileService.onDidRunUserOperation` for events triggered by user gestures
     * or `FileService.onDidRunOperation` triggered by user gestures and programmatically
     */
    readonly onDidCreate = this.fileCreateEmitter.onDid;

    protected readonly fileDeleteEmitter = new FileOperationEmitter<FileEvent>();
    /**
     * @deprecated since 1.4.0 - in order to support VS Code FS API (https://github.com/eclipse-theia/theia/pull/7908), use `FileService.onWillRunUserOperation` instead
     */
    readonly onWillDelete = this.fileDeleteEmitter.onWill;
    /**
     * @deprecated since 1.4.0 - in order to support VS Code FS API (https://github.com/eclipse-theia/theia/pull/7908), use `FileService.onDidFailUserOperation` instead
     */
    readonly onDidFailDelete = this.fileDeleteEmitter.onDidFail;
    /**
     * @deprecated since 1.4.0 - in order to support VS Code FS API (https://github.com/eclipse-theia/theia/pull/7908),
     * instead use `FileService.onDidRunUserOperation` for events triggered by user gestures
     * or `FileService.onDidRunOperation` triggered by user gestures and programmatically
     */
    readonly onDidDelete = this.fileDeleteEmitter.onDid;

    protected readonly fileMoveEmitter = new FileOperationEmitter<FileMoveEvent>();
    /**
     * @deprecated since 1.4.0 - in order to support VS Code FS API (https://github.com/eclipse-theia/theia/pull/7908), use `FileService.onWillRunUserOperation` instead
     */
    readonly onWillMove = this.fileMoveEmitter.onWill;
    /**
     * @deprecated since 1.4.0 - in order to support VS Code FS API (https://github.com/eclipse-theia/theia/pull/7908), use `FileService.onDidFailUserOperation` instead
     */
    readonly onDidFailMove = this.fileMoveEmitter.onDidFail;
    /**
     * @deprecated since 1.4.0 - in order to support VS Code FS API (https://github.com/eclipse-theia/theia/pull/7908),
     * instead use `FileService.onDidRunUserOperation` for events triggered by user gestures
     * or `FileService.onDidRunOperation` triggered by user gestures and programmatically
     */
    readonly onDidMove = this.fileMoveEmitter.onDid;

    @inject(FileService)
    protected readonly fileService: FileService;

    @postConstruct()
    protected init(): void {
        this.toDispose.push(this.onFileChangedEmitter);
        this.toDispose.push(this.fileDeleteEmitter);
        this.toDispose.push(this.fileMoveEmitter);

        this.toDispose.push(this.fileService.onWillRunUserOperation(event => {
            if (event.operation === FileOperation.CREATE) {
                this.fileCreateEmitter.fireWill({ uri: event.target });
            } else if (event.operation === FileOperation.DELETE) {
                this.fileDeleteEmitter.fireWill({ uri: event.target });
            } else if (event.operation === FileOperation.MOVE && event.source) {
                this.fileMoveEmitter.fireWill({ sourceUri: event.source, targetUri: event.target });
            }
        }));
        this.toDispose.push(this.fileService.onDidFailUserOperation(event => {
            if (event.operation === FileOperation.CREATE) {
                this.fileCreateEmitter.fireDid(true, { uri: event.target });
            } else if (event.operation === FileOperation.DELETE) {
                this.fileDeleteEmitter.fireDid(true, { uri: event.target });
            } else if (event.operation === FileOperation.MOVE && event.source) {
                this.fileMoveEmitter.fireDid(true, { sourceUri: event.source, targetUri: event.target });
            }
        }));
        this.toDispose.push(this.fileService.onDidRunUserOperation(event => {
            if (event.operation === FileOperation.CREATE) {
                this.fileCreateEmitter.fireDid(false, { uri: event.target });
            } else if (event.operation === FileOperation.DELETE) {
                this.fileDeleteEmitter.fireDid(false, { uri: event.target });
            } else if (event.operation === FileOperation.MOVE && event.source) {
                this.fileMoveEmitter.fireDid(false, { sourceUri: event.source, targetUri: event.target });
            }
        }));
    }

    /**
     * Stop watching.
     */
    dispose(): void {
        this.toDispose.dispose();
    }

    /**
     * Start file watching under the given uri.
     *
     * Resolve when watching is started.
     * Return a disposable to stop file watching under the given uri.
     */
    async watchFileChanges(uri: URI): Promise<Disposable> {
        return this.fileService.watch(uri);
    }

}
