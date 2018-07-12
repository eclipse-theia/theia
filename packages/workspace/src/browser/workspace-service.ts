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
import { FileSystemWatcher } from '@theia/filesystem/lib/browser';
import { WorkspaceServer } from '../common';
import { WindowService } from '@theia/core/lib/browser/window/window-service';
import { FrontendApplication, FrontendApplicationContribution } from '@theia/core/lib/browser';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { ILogger } from '@theia/core/lib/common/logger';
import { WorkspacePreferences } from './workspace-preferences';

/**
 * The workspace service.
 */
@injectable()
export class WorkspaceService implements FrontendApplicationContribution {

    private _root: FileStat | undefined;

    private readonly deferredRoot = new Deferred<FileStat | undefined>();

    readonly root = this.deferredRoot.promise;

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
        const rootUri = await this.server.getWorkspace();
        this._root = await this.toValidRoot(rootUri);
        if (this._root) {
            const uri = new URI(this._root.uri);
            this.updateTitle(uri);
            this.watcher.watchFileChanges(uri);
        }
        this.deferredRoot.resolve(this._root);
    }

    protected updateTitle(uri: URI): void {
        document.title = uri.displayName;
    }

    /**
     * on unload, we set our workspace root as the last recently used on the backend.
     * @param app
     */
    onStop(app: FrontendApplication): void {
        if (this._root) {
            this.server.setWorkspace(this._root.uri);
        }
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
        return !!this._root;
    }

    /**
     * Opens the given URI as the current workspace root.
     */
    open(uri: URI, options?: WorkspaceInput): void {
        this.doOpen(uri, options);
    }

    protected async doOpen(uri: URI, options?: WorkspaceInput): Promise<void> {
        const rootUri = uri.toString();
        const valid = await this.toValidRoot(rootUri);
        if (valid) {
            // The same window has to be preserved too (instead of opening a new one), if the workspace root is not yet available and we are setting it for the first time.
            // Option passed as parameter has the highest priority (for api developers), then the preference, then the default.
            const { preserveWindow } = {
                preserveWindow: this.preferences['workspace.preserveWindow'] || !(await this.root),
                ...options
            };
            await this.server.setWorkspace(rootUri);
            if (preserveWindow) {
                this._root = valid;
            }
            this.openWindow(uri, { preserveWindow });
            return;
        }
        throw new Error(`Invalid workspace root URI. Expected an existing directory location. URI: ${rootUri}.`);
    }

    /**
     * Clears current workspace root and reloads window.
     */
    close(): void {
        this.doClose();
    }

    protected async doClose(): Promise<void> {
        this._root = undefined;
        await this.server.setWorkspace('');
        this.reloadWindow();
    }

    /**
     * returns a FileStat if the argument URI points to an existing directory. Otherwise, `undefined`.
     */
    protected async toValidRoot(uri: string | undefined): Promise<FileStat | undefined> {
        if (!uri) {
            return undefined;
        }
        try {
            if (uri && uri.endsWith("/")) {
                uri = uri.slice(0, -1);
            }
            const fileStat = await this.fileSystem.getFileStat(uri);
            if (!fileStat) {
                return undefined;
            }
            if (fileStat.isDirectory) {
                return fileStat;
            }
            return undefined;
        } catch (error) {
            return undefined;
        }
    }

    protected openWindow(uri: URI, options?: WorkspaceInput): void {
        if (this.shouldPreserveWindow(options)) {
            this.reloadWindow();
        } else {
            try {
                this.openNewWindow();
            } catch (error) {
                // Fall back to reloading the current window in case the browser has blocked the new window
                this._root = undefined;
                this.logger.error(error.toString()).then(() => this.reloadWindow());
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
        const workspaceRoot = await this.root;
        if (workspaceRoot) {
            const uri = new URI(workspaceRoot.uri);
            for (const path of paths) {
                const fileUri = uri.resolve(path).toString();
                const exists = await this.fileSystem.exists(fileUri);
                if (exists) {
                    return exists;
                }
            }
        }
        return false;
    }

}

export interface WorkspaceInput {

    /**
     * Tests whether the same window should be used or a new one has to be opened after setting the workspace root. By default it is `false`.
     */
    preserveWindow?: boolean;

}
