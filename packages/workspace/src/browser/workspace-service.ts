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

import { injectable, inject, postConstruct } from 'inversify';
import URI from '@theia/core/lib/common/uri';
import { FileSystem, FileStat } from '@theia/filesystem/lib/common';
import { FileSystemWatcher, FileChangeEvent } from '@theia/filesystem/lib/browser/filesystem-watcher';
import { WorkspaceServer } from '../common';
import { WindowService } from '@theia/core/lib/browser/window/window-service';
import { FrontendApplication, FrontendApplicationContribution } from '@theia/core/lib/browser';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { ILogger, Disposable, DisposableCollection, Emitter, Event } from '@theia/core';
import { WorkspacePreferences } from './workspace-preferences';
import * as jsoncparser from 'jsonc-parser';
import * as Ajv from 'ajv';

export const THEIA_EXT = 'theia-workspace';
export const VSCODE_EXT = 'code-workspace';

export const IWorkspaceService = Symbol('IWorkspaceService');
export interface IWorkspaceService {
    roots: Promise<FileStat[]>;
}

/**
 * The workspace service.
 */
@injectable()
export class WorkspaceService implements FrontendApplicationContribution {

    private _workspace: FileStat | undefined;

    private _roots: FileStat[] = [];
    private deferredRoots = new Deferred<FileStat[]>();

    private hasWorkspace: boolean = false;

    @inject(FileSystem)
    protected readonly fileSystem: FileSystem;

    @inject(FileSystemWatcher)
    protected readonly watcher: FileSystemWatcher;

    @inject(WorkspaceServer)
    protected readonly server: WorkspaceServer;

    @inject(WindowService)
    protected readonly windowService: WindowService;

    @inject(ILogger)
    protected logger: ILogger;

    @inject(WorkspacePreferences)
    protected preferences: WorkspacePreferences;

    @postConstruct()
    protected async init(): Promise<void> {
        const workspaceUri = await this.server.getMostRecentlyUsedWorkspace();
        const workspaceFileStat = await this.toFileStat(workspaceUri);
        await this.setWorkspace(workspaceFileStat);

        this.watcher.onFilesChanged(event => {
            if (this._workspace && FileChangeEvent.isAffected(event, new URI(this._workspace.uri))) {
                this.updateWorkspace();
            }
        });
        this.preferences.onPreferenceChanged(event => {
            const multiRootPrefName = 'workspace.supportMultiRootWorkspace';
            if (event.preferenceName === multiRootPrefName) {
                this.updateWorkspace();
            }
        });
    }

    get roots(): Promise<FileStat[]> {
        return this.deferredRoots.promise;
    }
    tryGetRoots(): FileStat[] {
        return this._roots;
    }
    get workspace(): FileStat | undefined {
        return this._workspace;
    }

    protected readonly onWorkspaceChangeEmitter = new Emitter<FileStat[]>();
    get onWorkspaceChanged(): Event<FileStat[]> {
        return this.onWorkspaceChangeEmitter.event;
    }

    protected readonly toDisposeOnWorkspace = new DisposableCollection();
    protected async setWorkspace(workspaceStat: FileStat | undefined): Promise<void> {
        if (FileStat.equals(this._workspace, workspaceStat)) {
            return;
        }
        this.toDisposeOnWorkspace.dispose();
        this._workspace = workspaceStat;
        if (this._workspace) {
            this.toDisposeOnWorkspace.push(await this.watcher.watchFileChanges(new URI(this._workspace.uri)));
        }
        this.updateTitle();
        await this.updateWorkspace();
    }

    protected async updateWorkspace(): Promise<void> {
        await this.updateRoots();
        this.watchRoots();
    }

    protected async updateRoots(): Promise<void> {
        this._roots = await this.computeRoots();
        this.deferredRoots.resolve(this._roots); // in order to resolve first
        this.deferredRoots = new Deferred<FileStat[]>();
        this.deferredRoots.resolve(this._roots);
        this.onWorkspaceChangeEmitter.fire(this._roots);
    }

    protected async computeRoots(): Promise<FileStat[]> {
        const roots: FileStat[] = [];
        if (this._workspace) {
            if (this._workspace.isDirectory) {
                return [this._workspace];
            }

            const workspaceData = await this.getWorkspaceDataFromFile();
            if (workspaceData) {
                for (const { path } of workspaceData.folders) {
                    const valid = await this.toValidRoot(path);
                    if (valid) {
                        roots.push(valid);
                    } else {
                        roots.push({
                            uri: path,
                            lastModification: Date.now(),
                            isDirectory: true
                        });
                    }
                }
            }
        }
        return roots;
    }

    protected async getWorkspaceDataFromFile(): Promise<WorkspaceData | undefined> {
        if (this._workspace && await this.fileSystem.exists(this._workspace.uri)) {
            if (this._workspace.isDirectory) {
                return {
                    folders: [{ path: this._workspace.uri }]
                };
            }
            const { stat, content } = await this.fileSystem.resolveContent(this._workspace.uri);
            const strippedContent = jsoncparser.stripComments(content);
            const data = jsoncparser.parse(strippedContent);
            if (data && WorkspaceData.is(data)) {
                return WorkspaceData.transformToAbsolute(data, stat);
            }
            this.logger.error(`Unable to retrieve workspace data from the file: '${this._workspace.uri}'. Please check if the file is corrupted.`);
        }
    }

    protected updateTitle(): void {
        if (this._workspace) {
            const uri = new URI(this._workspace.uri);
            const displayName = uri.displayName;
            if (!this._workspace.isDirectory &&
                (displayName.endsWith(`.${THEIA_EXT}`) || displayName.endsWith(`.${VSCODE_EXT}`))) {
                document.title = displayName.slice(0, displayName.lastIndexOf('.'));
            } else {
                document.title = displayName;
            }
        } else {
            document.title = window.location.href;
        }
    }

    /**
     * on unload, we set our workspace root as the last recently used on the backend.
     * @param app
     */
    onStop(app: FrontendApplication): void {
        this.server.setMostRecentlyUsedWorkspace(this._workspace ? this._workspace.uri : '');
    }

    async onStart() {
        const allWorkspace = await this.recentWorkspaces();
        if (allWorkspace.length > 0) {
            this.hasWorkspace = true;
        }
    }

    get hasHistory(): boolean {
        return this.hasWorkspace;
    }

    async recentWorkspaces(): Promise<string[]> {
        return this.server.getRecentWorkspaces();
    }

    /**
     * Returns `true` if current workspace root is set.
     * @returns {boolean}
     */
    get opened(): boolean {
        return !!this._workspace;
    }

    /**
     * Returns `true` if there is an opened workspace in theia, and the workspace has more than one root.
     * @returns {boolean}
     */
    get isMultiRootWorkspaceOpened(): boolean {
        return this.opened && this.preferences['workspace.supportMultiRootWorkspace'];
    }

    /**
     * Opens directory, or recreates a workspace from the file that `uri` points to.
     */
    open(uri: URI, options?: WorkspaceInput): void {
        this.doOpen(uri, options);
    }

    protected async doOpen(uri: URI, options?: WorkspaceInput): Promise<void> {
        const rootUri = uri.toString();
        const stat = await this.toFileStat(rootUri);
        if (stat) {
            // The same window has to be preserved too (instead of opening a new one), if the workspace root is not yet available and we are setting it for the first time.
            // Option passed as parameter has the highest priority (for api developers), then the preference, then the default.
            await this.roots;
            const { preserveWindow } = {
                preserveWindow: this.preferences['workspace.preserveWindow'] || !this.opened,
                ...options
            };
            await this.server.setMostRecentlyUsedWorkspace(rootUri);
            if (preserveWindow) {
                this._workspace = stat;
            }
            await this.openWindow(stat, { preserveWindow });
            return;
        }
        throw new Error('Invalid workspace root URI. Expected an existing directory location.');
    }

    /**
     * Adds a root folder to the workspace
     * @param uri URI of the root folder being added
     */
    async addRoot(uri: URI): Promise<void> {
        await this.roots;

        if (!this.opened) {
            throw new Error('Folder cannot be added as there is no active workspace or opened folder.');
        }
        const valid = await this.toValidRoot(uri);
        if (!valid) {
            throw new Error(`Invalid workspace root URI. Expected an existing directory location. URI: ${uri.toString()}.`);
        }

        if (this._workspace && !this._roots.find(r => r.uri === valid.uri)) {
            if (this._workspace.isDirectory) { // save the workspace data in a temporary file
                const tempFile = await this.getTemporaryWorkspaceFile();
                if (tempFile) {
                    await this.save(tempFile);
                }
            }
            this._workspace = await this.writeWorkspaceFile(this._workspace, [...this._roots, valid]);
        }
    }

    /**
     * Removes root folder(s) from workspace.
     */
    async removeRoots(uris: URI[]): Promise<void> {
        if (!this.opened) {
            throw new Error('Folder cannot be removed as there is no active folder in the current workspace.');
        }
        if (this._workspace) {
            this._workspace = await this.writeWorkspaceFile(
                this._workspace, this._roots.filter(root => uris.findIndex(u => u.toString() === root.uri) < 0)
            );
        }
    }

    private async writeWorkspaceFile(workspaceFile: FileStat | undefined, rootFolders: FileStat[]): Promise<FileStat | undefined> {
        if (workspaceFile) {
            const workspaceData = WorkspaceData.transformToRelative(
                WorkspaceData.buildWorkspaceData(rootFolders.map(f => f.uri)), workspaceFile
            );
            if (workspaceData) {
                const stat = await this.fileSystem.setContent(workspaceFile, JSON.stringify(workspaceData));
                return stat;
            }
        }
    }

    private async getTemporaryWorkspaceFile(): Promise<FileStat | undefined> {
        const home = await this.fileSystem.getCurrentUserHome();
        if (home) {
            const tempWorkspaceUri = getTemporaryWorkspaceFileUri(new URI(home.uri));
            if (!await this.fileSystem.exists(tempWorkspaceUri.toString())) {
                return await this.fileSystem.createFile(tempWorkspaceUri.toString());
            }
            return this.toFileStat(tempWorkspaceUri);
        }
    }

    /**
     * Clears current workspace root.
     */
    close(): void {
        this._workspace = undefined;
        this._roots.length = 0;

        this.server.setMostRecentlyUsedWorkspace('');
        this.reloadWindow();
    }

    /**
     * returns a FileStat if the argument URI points to an existing directory. Otherwise, `undefined`.
     */
    protected async toValidRoot(uri: URI | string | undefined): Promise<FileStat | undefined> {
        const fileStat = await this.toFileStat(uri);
        if (fileStat && fileStat.isDirectory) {
            return fileStat;
        }
        return undefined;
    }

    /**
     * returns a FileStat if the argument URI points to a file or directory. Otherwise, `undefined`.
     */
    protected async toFileStat(uri: URI | string | undefined): Promise<FileStat | undefined> {
        if (!uri) {
            return undefined;
        }
        let uriStr = uri.toString();
        try {
            if (uriStr.endsWith('/')) {
                uriStr = uriStr.slice(0, -1);
            }
            const fileStat = await this.fileSystem.getFileStat(uriStr);
            if (!fileStat) {
                return undefined;
            }
            return fileStat;
        } catch (error) {
            return undefined;
        }
    }

    protected openWindow(uri: FileStat, options?: WorkspaceInput): void {
        if (this.shouldPreserveWindow(options)) {
            this.reloadWindow();
        } else {
            try {
                this.openNewWindow();
            } catch (error) {
                // Fall back to reloading the current window in case the browser has blocked the new window
                this._workspace = uri;
                this.logger.error(error.toString()).then(async () => await this.reloadWindow());
            }
        }
    }

    protected reloadWindow(): void {
        window.location.reload(true);
    }

    protected openNewWindow(): void {
        this.windowService.openNewWindow(window.location.href);
    }

    protected shouldPreserveWindow(options?: WorkspaceInput): boolean {
        return options !== undefined && !!options.preserveWindow;
    }

    /**
     * Return true if one of the paths in paths array is present in the workspace
     * NOTE: You should always explicitly use `/` as the separator between the path segments.
     */
    async containsSome(paths: string[]): Promise<boolean> {
        await this.roots;
        if (this.opened) {
            for (const root of this._roots) {
                const uri = new URI(root.uri);
                for (const path of paths) {
                    const fileUri = uri.resolve(path).toString();
                    const exists = await this.fileSystem.exists(fileUri);
                    if (exists) {
                        return exists;
                    }
                }
            }
        }
        return false;
    }

    get saved(): boolean {
        return !!this._workspace && !this._workspace.isDirectory;
    }

    /**
     * Save workspace data into a file
     * @param uri URI or FileStat of the workspace file
     */
    async save(uri: URI | FileStat): Promise<void> {
        const uriStr = uri instanceof URI ? uri.toString() : uri.uri;
        if (!await this.fileSystem.exists(uriStr)) {
            await this.fileSystem.createFile(uriStr);
        }
        let stat = await this.toFileStat(uriStr);
        stat = await this.writeWorkspaceFile(stat, await this.roots);
        await this.server.setMostRecentlyUsedWorkspace(uriStr);
        await this.setWorkspace(stat);
    }

    protected readonly rootWatchers = new Map<string, Disposable>();

    protected async watchRoots(): Promise<void> {
        const rootUris = new Set(this._roots.map(r => r.uri));
        for (const [uri, watcher] of this.rootWatchers.entries()) {
            if (!rootUris.has(uri)) {
                watcher.dispose();
            }
        }
        for (const root of this._roots) {
            this.watchRoot(root);
        }
    }

    protected async watchRoot(root: FileStat): Promise<void> {
        const uriStr = root.uri;
        if (this.rootWatchers.has(uriStr)) {
            return;
        }
        const watcher = this.watcher.watchFileChanges(new URI(uriStr));
        this.rootWatchers.set(uriStr, Disposable.create(() => {
            watcher.then(disposable => disposable.dispose());
            this.rootWatchers.delete(uriStr);
        }));
    }

}

export function getTemporaryWorkspaceFileUri(home: URI): URI {
    return home.resolve('.theia').resolve(`Untitled.${THEIA_EXT}`).withScheme('file');
}

export interface WorkspaceInput {

    /**
     * Tests whether the same window should be used or a new one has to be opened after setting the workspace root. By default it is `false`.
     */
    preserveWindow?: boolean;

}

interface WorkspaceData {
    folders: Array<{ path: string }>;
    // TODO add workspace settings settings?: { [id: string]: any };
}

namespace WorkspaceData {
    const validateSchema = new Ajv().compile({
        type: 'object',
        properties: {
            folders: {
                description: 'Root folders in the workspace',
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        path: {
                            type: 'string',
                        }
                    },
                    required: ['path']
                }
            }
        }
    });

    // tslint:disable-next-line:no-any
    export function is(data: any): data is WorkspaceData {
        return !!validateSchema(data);
    }

    export function buildWorkspaceData(folders: string[]): WorkspaceData {
        return {
            folders: folders.map(f => ({ path: f }))
        };
    }

    export function transformToRelative(data: WorkspaceData, workspaceFile?: FileStat): WorkspaceData {
        const folderUris: string[] = [];
        const workspaceFileUri = new URI(workspaceFile ? workspaceFile.uri : '').withScheme('file');
        for (const { path } of data.folders) {
            const folderUri = new URI(path).withScheme('file');
            const rel = workspaceFileUri.parent.relative(folderUri);
            if (rel) {
                folderUris.push(rel.toString());
            } else {
                folderUris.push(folderUri.toString());
            }
        }
        return buildWorkspaceData(folderUris);
    }

    export function transformToAbsolute(data: WorkspaceData, workspaceFile?: FileStat): WorkspaceData {
        if (workspaceFile) {
            const folders: string[] = [];
            for (const folder of data.folders) {
                const path = folder.path;
                if (path.startsWith('file:///')) {
                    folders.push(path);
                } else {
                    folders.push(new URI(workspaceFile.uri).withScheme('file').parent.resolve(path).toString());
                }

            }
            return Object.assign(data, buildWorkspaceData(folders));
        }
        return data;
    }
}
