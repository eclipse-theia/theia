// *****************************************************************************
// Copyright (C) 2026 Robert Jandow
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
import { FileSystemAccessHandle, FileSystemAccessPermissionState, WindowWithFileSystemAccess } from './file-system-access-types.js';
import { LocalDirectoryMount, LocalDirectoryMountPath, LocalDirectoryMountService } from './local-directory-mount-service.js';
import { LocalDirectoryHandleStore } from './local-directory-handle-store.js';
import { LocalDirectoryFileSystemProviderFactory } from './local-directory-file-system-provider.js';

@injectable()
export class LocalDirectoryMountServiceImpl implements LocalDirectoryMountService {

    @inject(LocalDirectoryHandleStore)
    protected readonly store: LocalDirectoryHandleStore;

    @inject(LocalDirectoryFileSystemProviderFactory)
    protected readonly providerFactory: LocalDirectoryFileSystemProviderFactory;

    @inject(ILogger) @named('filesystem:LocalDirectoryMountServiceImpl')
    protected readonly logger: ILogger;

    /**
     * Where local directories are mounted. Subclasses can override it if the default collides with their content.
     * Has to be a single top-level segment, as the mounts are only discoverable through the listing of `/`.
     */
    protected readonly rootPath: string = LocalDirectoryMount.DEFAULT_ROOT;

    protected readonly mounts = new Map<string, LocalDirectoryMount>();
    protected readonly onDidChangeMountsEmitter = new Emitter<void>();
    readonly onDidChangeMounts: Event<void> = this.onDidChangeMountsEmitter.event;

    protected _ready: Promise<void> = Promise.resolve();
    get ready(): Promise<void> {
        return this._ready;
    }

    get rootUri(): URI {
        return new URI('file:///').withPath(this.rootPath);
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
        return typeof this.getWindow()?.showDirectoryPicker === 'function';
    }

    protected getWindow(): WindowWithFileSystemAccess | undefined {
        return typeof window === 'undefined' ? undefined : window as unknown as WindowWithFileSystemAccess;
    }

    async pickAndMount(): Promise<URI | undefined> {
        const win = this.getWindow();
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

        // Not before the picker, the user gesture can expire if we wait.
        await this.ready;
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

    toUri(name: string): URI {
        return this.rootUri.resolve(name);
    }

    getMountPath(uri: URI): LocalDirectoryMountPath | undefined {
        return uri.scheme === 'file' ? LocalDirectoryMount.splitPath(this.rootUri.path, uri.path) : undefined;
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
            uri: this.toUri(name),
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
