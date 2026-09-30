// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable, named, postConstruct } from '@theia/core/shared/inversify';
import { Emitter, Event, ILogger, URI } from '@theia/core';
import { FileSystemAccess, FileSystemAccessHandle, FileSystemAccessPermissionState } from './file-system-access-types';
import { LocalDirectoryMount, LocalDirectoryMountService } from './local-directory-mount-service';
import { LocalDirectoryHandleStore } from './local-directory-handle-store';
import { LocalDirectoryFileSystemProviderFactory } from './local-directory-file-system-provider';

@injectable()
export class LocalDirectoryMountServiceImpl implements LocalDirectoryMountService {

    @inject(LocalDirectoryHandleStore)
    protected readonly store: LocalDirectoryHandleStore;

    @inject(LocalDirectoryFileSystemProviderFactory)
    protected readonly providerFactory: LocalDirectoryFileSystemProviderFactory;

    @inject(ILogger) @named('filesystem:LocalDirectoryMountServiceImpl')
    protected readonly logger: ILogger;

    protected readonly mounts = new Map<string, LocalDirectoryMount>();
    protected readonly onDidChangeMountsEmitter = new Emitter<void>();
    readonly onDidChangeMounts: Event<void> = this.onDidChangeMountsEmitter.event;

    protected _ready: Promise<void> = Promise.resolve();
    get ready(): Promise<void> {
        return this._ready;
    }

    @postConstruct()
    protected init(): void {
        this._ready = this.restore();
    }

    protected async restore(): Promise<void> {
        // No mount can exist without the API, so don't touch IndexedDB at startup.
        if (!this.isSupported()) {
            return;
        }
        try {
            const records = await this.store.getAll();
            const permissions = await Promise.all(records.map(record => this.queryPermission(record.handle)));
            records.forEach(({ name, handle }, index) => this.mounts.set(name, this.createMount(name, handle, permissions[index])));
            if (records.length > 0) {
                this.onDidChangeMountsEmitter.fire();
            }
        } catch (error) {
            this.logger.error('Failed to restore local directory mounts', error);
        }
    }

    isSupported(): boolean {
        return FileSystemAccess.isSupported();
    }

    async pickAndMount(): Promise<URI | undefined> {
        await this.ready;
        const win = FileSystemAccess.getWindow();
        if (!win?.showDirectoryPicker) {
            return undefined;
        }
        let handle: FileSystemDirectoryHandle;
        try {
            handle = await win.showDirectoryPicker({ id: 'theia-local-folder', mode: 'readwrite' });
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                return undefined;
            }
            throw error;
        }

        for (const existing of this.mounts.values()) {
            if (await existing.handle.isSameEntry(handle)) {
                if (existing.permission !== 'granted') {
                    existing.permission = 'granted';
                    this.onDidChangeMountsEmitter.fire();
                }
                return existing.uri;
            }
        }

        const name = this.getUniqueName(handle.name);
        try {
            await this.store.put({ name, handle });
        } catch (error) {
            // The mount still works for this session, it just won't be restored after a reload.
            this.logger.error('Failed to persist local directory handle', error);
        }
        const mount = this.createMount(name, handle, 'granted');
        this.mounts.set(name, mount);
        this.onDidChangeMountsEmitter.fire();
        return mount.uri;
    }

    getMount(name: string): LocalDirectoryMount | undefined {
        return this.mounts.get(name);
    }

    getMounts(): LocalDirectoryMount[] {
        return Array.from(this.mounts.values());
    }

    async unmount(name: string): Promise<void> {
        const mount = this.mounts.get(name);
        if (!mount) {
            return;
        }
        this.mounts.delete(name);
        mount.provider.dispose();
        try {
            await this.store.delete(name);
        } catch (error) {
            this.logger.error('Failed to remove local directory handle', error);
        }
        this.onDidChangeMountsEmitter.fire();
    }

    async requestAccess(name: string): Promise<boolean> {
        const mount = this.mounts.get(name);
        if (!mount) {
            return false;
        }
        const handle = mount.handle as FileSystemAccessHandle;
        let permission: FileSystemAccessPermissionState;
        try {
            permission = handle.requestPermission ? await handle.requestPermission({ mode: 'readwrite' }) : 'granted';
        } catch (error) {
            this.logger.error('Failed to request local directory permission', error);
            permission = 'denied';
        }
        if (mount.permission !== permission) {
            mount.permission = permission;
            this.onDidChangeMountsEmitter.fire();
        }
        return permission === 'granted';
    }

    protected createMount(name: string, handle: FileSystemDirectoryHandle, permission: FileSystemAccessPermissionState): LocalDirectoryMount {
        return {
            name,
            handle,
            uri: LocalDirectoryMount.toUri(name),
            provider: this.providerFactory({ handle }),
            permission
        };
    }

    protected async queryPermission(handle: FileSystemDirectoryHandle): Promise<FileSystemAccessPermissionState> {
        const accessHandle = handle as FileSystemAccessHandle;
        if (!accessHandle.queryPermission) {
            return 'granted';
        }
        try {
            return await accessHandle.queryPermission({ mode: 'readwrite' });
        } catch (error) {
            this.logger.error('Failed to query local directory permission', error);
            return 'prompt';
        }
    }

    protected getUniqueName(handleName: string): string {
        // '/' would split the mount name into several path segments.
        const base = handleName.replace(/[\\/]/g, '_').trim() || 'folder';
        let name = base;
        for (let i = 2; this.mounts.has(name); i++) {
            name = `${base}-${i}`;
        }
        return name;
    }
}
