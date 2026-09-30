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

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { Disposable, DisposableCollection, DisposableWrapper, Emitter, Event, URI } from '@theia/core';
import { TextDocumentContentChangeEvent } from '@theia/core/shared/vscode-languageserver-protocol';
import {
    FileChange, FileChangeType, FileDeleteOptions, FileOpenOptions, FileOverwriteOptions,
    FileSystemProviderCapabilities, FileSystemProviderErrorCode, FileSystemProviderWithFileFolderCopyCapability,
    FileSystemProviderWithFileReadWriteCapability, FileSystemProviderWithOpenReadWriteCloseCapability, FileType,
    FileUpdateOptions, FileUpdateResult, FileWriteOptions, Stat, WatchOptions, createFileSystemProviderError
} from '../../common/files';
import { OPFSFileSystemProvider } from '../opfs-filesystem-provider';
import { FileSystemAccessPermissionState } from './file-system-access-types';
import { LocalDirectoryMount, LocalDirectoryMountService } from './local-directory-mount-service';

/** The target of an operation: the OPFS, the virtual `/local` directory or a mounted local directory. */
type Route =
    { kind: 'opfs' } |
    { kind: 'local-root' } |
    { kind: 'mount', name: string, relative: URI };

interface MountSubscription {
    provider: LocalDirectoryMount['provider'];
    disposable: Disposable;
    permission: FileSystemAccessPermissionState;
}

/**
 * Dispatches to the OPFS or to a mounted local directory based on the path.
 * Local directories live at `file:///local/<name>`, everything else is stored in the OPFS.
 */
@injectable()
export class BrowserOnlyCompositeFileSystemProvider implements Disposable,
    FileSystemProviderWithFileReadWriteCapability,
    FileSystemProviderWithOpenReadWriteCloseCapability,
    FileSystemProviderWithFileFolderCopyCapability {

    capabilities: FileSystemProviderCapabilities =
        FileSystemProviderCapabilities.FileReadWrite |
        FileSystemProviderCapabilities.FileOpenReadWriteClose |
        FileSystemProviderCapabilities.FileFolderCopy |
        FileSystemProviderCapabilities.Update;

    onDidChangeCapabilities: Event<void> = Event.None;
    readonly onFileWatchError: Event<void> = Event.None;

    protected readonly onDidChangeFileEmitter = new Emitter<readonly FileChange[]>();
    readonly onDidChangeFile = this.onDidChangeFileEmitter.event;

    @inject(OPFSFileSystemProvider)
    protected readonly opfs: OPFSFileSystemProvider;

    @inject(LocalDirectoryMountService)
    protected readonly mountService: LocalDirectoryMountService;

    protected readonly toDispose = new DisposableCollection(this.onDidChangeFileEmitter);
    protected readonly subscriptions = new Map<string, MountSubscription>();

    // Descriptors of different providers may collide, so callers only ever see our own.
    protected readonly openFiles = new Map<number, { provider: OpenProvider, fd: number }>();
    protected nextFd = 1;

    @postConstruct()
    protected init(): void {
        this.toDispose.push(this.opfs.onDidChangeFile(changes => this.onDidChangeFileEmitter.fire(changes)));
        this.toDispose.push(this.mountService.onDidChangeMounts(() => this.syncMounts(true)));
        this.syncMounts(false);
    }

    // #region Mount tracking

    protected syncMounts(fireEvents: boolean): void {
        const mounts = this.mountService.getMounts();
        const hadMounts = this.subscriptions.size > 0;
        const changes: FileChange[] = [];
        const current = new Set<string>();

        for (const mount of mounts) {
            current.add(mount.name);
            const existing = this.subscriptions.get(mount.name);
            if (existing && existing.provider !== mount.provider) {
                existing.disposable.dispose();
                this.subscriptions.delete(mount.name);
            }
            const subscription = this.subscriptions.get(mount.name);
            if (!subscription) {
                this.subscriptions.set(mount.name, {
                    provider: mount.provider,
                    disposable: mount.provider.onDidChangeFile(mountChanges => this.forwardMountChanges(mount.name, mountChanges)),
                    permission: mount.permission
                });
                changes.push({ resource: mount.uri, type: FileChangeType.ADDED });
            } else if (subscription.permission !== mount.permission) {
                if (mount.permission === 'granted') {
                    changes.push({ resource: mount.uri, type: FileChangeType.UPDATED });
                }
                subscription.permission = mount.permission;
            }
        }
        for (const [name, subscription] of Array.from(this.subscriptions.entries())) {
            if (!current.has(name)) {
                subscription.disposable.dispose();
                this.subscriptions.delete(name);
                changes.push({ resource: LocalDirectoryMount.toUri(name), type: FileChangeType.DELETED });
            }
        }

        const hasMounts = this.subscriptions.size > 0;
        const localRoot = LocalDirectoryMount.rootUri();
        if (!hadMounts && hasMounts) {
            changes.unshift({ resource: localRoot, type: FileChangeType.ADDED });
        } else if (hadMounts && !hasMounts) {
            changes.push({ resource: localRoot, type: FileChangeType.DELETED });
        }
        if (fireEvents && changes.length > 0) {
            this.onDidChangeFileEmitter.fire(changes);
        }
    }

    protected forwardMountChanges(name: string, changes: readonly FileChange[]): void {
        const mount = this.mountService.getMount(name);
        if (!mount) {
            return;
        }
        this.onDidChangeFileEmitter.fire(changes.map(change => ({
            resource: this.toAbsolute(mount, change.resource),
            type: change.type
        })));
    }

    protected toAbsolute(mount: LocalDirectoryMount, relative: URI): URI {
        const path = relative.path.toString().replace(/^\/+/, '');
        return path ? mount.uri.resolve(path) : mount.uri;
    }

    // #endregion

    // #region Routing

    protected getRoute(resource: URI): Route {
        const segments = resource.path.toString().split('/').filter(segment => segment.length > 0);
        if (segments.length === 0 || '/' + segments[0] !== LocalDirectoryMount.ROOT) {
            return { kind: 'opfs' };
        }
        if (segments.length === 1) {
            return { kind: 'local-root' };
        }
        const rest = segments.slice(2).join('/');
        const root = new URI('file:///');
        return { kind: 'mount', name: segments[1], relative: rest ? root.resolve(rest) : root };
    }

    /** Waits for the mounts of previous sessions first, so that requests made during startup don't fail with FileNotFound. */
    protected async getMount(name: string, resource: URI): Promise<LocalDirectoryMount> {
        await this.mountService.ready;
        const mount = this.mountService.getMount(name);
        if (!mount) {
            throw createFileSystemProviderError(`No local folder is mounted at ${resource.toString()}`, FileSystemProviderErrorCode.FileNotFound);
        }
        return mount;
    }

    protected noPermissions(message: string): Error {
        return createFileSystemProviderError(message, FileSystemProviderErrorCode.NoPermissions);
    }

    protected isMountRoot(route: Route): boolean {
        return route.kind === 'mount' && route.relative.path.toString() === '/';
    }

    /**
     * Resolves the provider handling the given resource.
     * Mounts without granted permission only expose their root as an empty directory,
     * so that a workspace pointing at them survives a reload until the user grants access again.
     */
    protected async resolve(resource: URI): Promise<ResolvedTarget> {
        const route = this.getRoute(resource);
        if (route.kind === 'opfs') {
            return { provider: this.opfs, uri: resource, route };
        }
        if (route.kind === 'local-root') {
            await this.mountService.ready;
            return { provider: undefined, uri: resource, route };
        }
        const mount = await this.getMount(route.name, resource);
        return {
            provider: mount.provider,
            uri: route.relative,
            route,
            mount,
            denied: mount.permission !== 'granted'
        };
    }

    protected async resolveForOperation(resource: URI, operation: string): Promise<ResolvedProvider> {
        return this.assertAccessible(await this.resolve(resource), resource, operation);
    }

    protected assertAccessible(target: ResolvedTarget, resource: URI, operation: string): ResolvedProvider {
        if (!target.provider) {
            throw this.noPermissions(`Cannot ${operation} the virtual folder ${resource.toString()}`);
        }
        if (target.denied) {
            throw this.noPermissions(`Access to ${target.mount!.name} was not granted`);
        }
        return target as ResolvedProvider;
    }

    protected localRootNotFound(resource: URI): Error {
        return createFileSystemProviderError(`File not found: ${resource.toString()}`, FileSystemProviderErrorCode.FileNotFound);
    }

    /** Mount roots can only be removed by unmounting them. */
    protected async resolveForModification(resource: URI, operation: string): Promise<ResolvedProvider> {
        const target = await this.resolveForOperation(resource, operation);
        if (this.isMountRoot(target.route)) {
            throw this.noPermissions(`Cannot ${operation} the root of a mounted folder`);
        }
        return target;
    }

    // #endregion

    watch(resource: URI, opts: WatchOptions): Disposable {
        const route = this.getRoute(resource);
        if (route.kind === 'opfs') {
            return this.opfs.watch(resource, opts);
        }
        // Mount changes are always forwarded, so the virtual folder needs no watcher.
        if (route.kind === 'local-root') {
            return Disposable.NULL;
        }
        const watcher = new DisposableWrapper();
        this.getMount(route.name, resource).then(mount => {
            if (mount.permission === 'granted') {
                watcher.set(mount.provider.watch(route.relative, opts));
            }
        }, () => { /* the mount does not exist (anymore), nothing to watch */ });
        return watcher;
    }

    async stat(resource: URI): Promise<Stat> {
        const target = await this.resolve(resource);
        if (target.route.kind === 'local-root') {
            if (this.mountService.getMounts().length === 0) {
                throw this.localRootNotFound(resource);
            }
            return { type: FileType.Directory, mtime: 0, ctime: 0, size: 0 };
        }
        if (target.denied) {
            if (this.isMountRoot(target.route)) {
                return { type: FileType.Directory, mtime: 0, ctime: 0, size: 0 };
            }
            throw this.noPermissions(`Access to ${target.mount!.name} was not granted`);
        }
        return target.provider!.stat(target.uri);
    }

    async mkdir(resource: URI): Promise<void> {
        const target = await this.resolve(resource);
        if (target.route.kind === 'local-root') {
            return;
        }
        const { provider, uri } = this.assertAccessible(target, resource, 'create a folder in');
        if (this.isMountRoot(target.route)) {
            return;
        }
        await provider.mkdir(uri);
    }

    async readdir(resource: URI): Promise<[string, FileType][]> {
        const target = await this.resolve(resource);
        if (target.route.kind === 'local-root') {
            const mounts = this.mountService.getMounts();
            if (mounts.length === 0) {
                throw this.localRootNotFound(resource);
            }
            return mounts.map(mount => [mount.name, FileType.Directory]);
        }
        if (target.route.kind === 'opfs') {
            const entries = await this.opfs.readdir(resource);
            if (resource.path.toString().replace(/\/+$/, '') === '' && this.mountService.getMounts().length > 0) {
                const name = LocalDirectoryMount.ROOT.substring(1);
                return [...entries.filter(([entry]) => entry !== name), [name, FileType.Directory]];
            }
            return entries;
        }
        if (target.denied && this.isMountRoot(target.route)) {
            return [];
        }
        const { provider, uri } = this.assertAccessible(target, resource, 'read');
        return provider.readdir(uri);
    }

    async delete(resource: URI, opts: FileDeleteOptions): Promise<void> {
        const { provider, uri } = await this.resolveForModification(resource, 'delete');
        await provider.delete(uri, opts);
    }

    async rename(from: URI, to: URI, opts: FileOverwriteOptions): Promise<void> {
        const source = await this.resolveForModification(from, 'rename');
        const target = await this.resolveForModification(to, 'rename to');
        if (source.provider === target.provider) {
            return source.provider.rename(source.uri, target.uri, opts);
        }
        await this.transfer(from, to, opts.overwrite);
        await this.delete(from, { recursive: true, useTrash: false });
    }

    async copy(from: URI, to: URI, opts: FileOverwriteOptions): Promise<void> {
        const source = await this.resolveForOperation(from, 'copy');
        const target = await this.resolveForModification(to, 'copy to');
        if (source.provider === target.provider) {
            return source.provider.copy(source.uri, target.uri, opts);
        }
        await this.transfer(from, to, opts.overwrite);
    }

    /** Copies between different providers by reading and writing every file. */
    protected async transfer(from: URI, to: URI, overwrite: boolean): Promise<void> {
        const sourceStat = await this.stat(from);
        const targetStat = await this.stat(to).catch(() => undefined);
        if (targetStat) {
            if (!overwrite) {
                throw createFileSystemProviderError(`File already exists: ${to.toString()}`, FileSystemProviderErrorCode.FileExists);
            }
            await this.delete(to, { recursive: true, useTrash: false });
        }
        await this.transferEntry(from, to, sourceStat);
    }

    protected async transferEntry(from: URI, to: URI, sourceStat: Stat): Promise<void> {
        if (sourceStat.type & FileType.Directory) {
            await this.mkdir(to);
            for (const [name, type] of await this.readdir(from)) {
                await this.transferEntry(from.resolve(name), to.resolve(name), { ...sourceStat, type });
            }
        } else {
            const content = await this.readFile(from);
            await this.writeFile(to, content, { create: true, overwrite: true });
        }
    }

    async readFile(resource: URI): Promise<Uint8Array> {
        const { provider, uri } = await this.resolveForOperation(resource, 'read');
        return provider.readFile(uri);
    }

    async writeFile(resource: URI, content: Uint8Array, opts: FileWriteOptions): Promise<void> {
        const { provider, uri } = await this.resolveForModification(resource, 'write');
        await provider.writeFile(uri, content, opts);
    }

    async open(resource: URI, opts: FileOpenOptions): Promise<number> {
        const { provider, uri } = await this.resolveForModification(resource, 'open');
        const fd = await provider.open(uri, opts);
        const id = this.nextFd++;
        this.openFiles.set(id, { provider, fd });
        return id;
    }

    async close(fd: number): Promise<void> {
        const entry = this.getOpenFile(fd);
        this.openFiles.delete(fd);
        await entry.provider.close(entry.fd);
    }

    read(fd: number, pos: number, data: Uint8Array, offset: number, length: number): Promise<number> {
        const entry = this.getOpenFile(fd);
        return entry.provider.read(entry.fd, pos, data, offset, length);
    }

    write(fd: number, pos: number, data: Uint8Array, offset: number, length: number): Promise<number> {
        const entry = this.getOpenFile(fd);
        return entry.provider.write(entry.fd, pos, data, offset, length);
    }

    protected getOpenFile(fd: number): { provider: OpenProvider, fd: number } {
        const entry = this.openFiles.get(fd);
        if (!entry) {
            throw createFileSystemProviderError(`Invalid file descriptor: ${fd}`, FileSystemProviderErrorCode.Unknown);
        }
        return entry;
    }

    async updateFile(resource: URI, changes: TextDocumentContentChangeEvent[], opts: FileUpdateOptions): Promise<FileUpdateResult> {
        const { provider, uri } = await this.resolveForModification(resource, 'update');
        return provider.updateFile(uri, changes, opts);
    }

    dispose(): void {
        this.subscriptions.forEach(subscription => subscription.disposable.dispose());
        this.subscriptions.clear();
        this.toDispose.dispose();
    }
}

type OpenProvider = FileSystemProviderWithFileReadWriteCapability &
    FileSystemProviderWithOpenReadWriteCloseCapability &
    FileSystemProviderWithFileFolderCopyCapability & {
        updateFile(resource: URI, changes: TextDocumentContentChangeEvent[], opts: FileUpdateOptions): Promise<FileUpdateResult>;
    };

interface ResolvedTarget {
    provider: OpenProvider | undefined;
    /** The URI to hand to the provider, relative to the mount root for mounts. */
    uri: URI;
    route: Route;
    mount?: LocalDirectoryMount;
    denied?: boolean;
}

interface ResolvedProvider extends ResolvedTarget {
    provider: OpenProvider;
}
