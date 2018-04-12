/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject, postConstruct } from 'inversify';
import URI from '@theia/core/lib/common/uri';
import { FileSystem, FileStat } from '@theia/filesystem/lib/common';
import { FileSystemWatcher } from '@theia/filesystem/lib/browser';
import { WorkspaceServer, WorkspaceSettings } from '../common';
import { WindowService } from '@theia/core/lib/browser/window/window-service';
import { FrontendApplication, FrontendApplicationContribution } from '@theia/core/lib/browser';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { ILogger } from '@theia/core/lib/common/logger';
import { WorkspacePreferences } from './workspace-preferences';
import * as uuid from 'uuid/v4';

/**
 * The workspace service.
 */
@injectable()
export class WorkspaceService implements FrontendApplicationContribution {

    private _id: string | undefined;
    private _activeRoot: FileStat | undefined;
    private _roots: FileStat[] = [];
    private _workspaceSettings: WorkspaceSettings = {};

    private readonly deferredWorkspaceId = new Deferred<string | undefined>();
    private readonly deferredActiveRoot = new Deferred<FileStat | undefined>();
    private readonly deferredRoots = new Deferred<FileStat[]>();
    private readonly deferredWorkspaceConfig = new Deferred<FileStat | undefined>();
    private readonly deferredWorkspaceSettings = new Deferred<WorkspaceSettings>();

    readonly workspaceId = this.deferredWorkspaceId.promise;
    readonly activeRoot = this.deferredActiveRoot.promise;
    readonly roots = this.deferredRoots.promise;
    readonly workspaceConfig = this.deferredWorkspaceConfig.promise;
    readonly workspaceSettings = this.deferredWorkspaceSettings.promise;

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
        this._id = await this.server.getDefaultWorkspaceInstanceId();
        if (!this._id) {
            this._id = uuid();
        }
        this.deferredWorkspaceId.resolve(this._id);
        const activeRootUri = await this.server.getActiveRoot(this._id!);
        this._activeRoot = await this.toValidRoot(activeRootUri);
        if (this._activeRoot) { // TODO display the workspace name, or `untitled workspace` if there isn't one
            const uri = new URI(this._activeRoot.uri);
            this.updateTitle(uri);
        }
        this.deferredActiveRoot.resolve(this._activeRoot);

        const rootUris = await this.server.getRoots(this._id!);
        for (const uri of rootUris) {
            const valid = await this.toValidRoot(uri);
            if (valid) {
                this._roots.push(valid);
                this.watcher.watchFileChanges(new URI(valid.uri));
            }
        }
        this.deferredRoots.resolve(this._roots);

        this._workspaceSettings = await this.server.getWorkspaceSettings(this._id);
        console.log(`\nworkspace settings from the service: ${JSON.stringify(this._workspaceSettings)}\n`);
        this.deferredWorkspaceSettings.resolve(this._workspaceSettings);

        await this.updateWorkspaceConfigFileStat();
        this.server.setActiveRoot(this._activeRoot ? this._activeRoot.uri : '', this._id!);
    }

    protected updateTitle(uri: URI): void {
        document.title = uri.displayName;
    }

    /**
     * on unload, we set our workspace root as the last recently used on the backend.
     * @param app
     */
    onStop(app: FrontendApplication): void {
        if (this._activeRoot) {
            this.server.setActiveRoot(this._activeRoot.uri, this._id!);
        }
    }

    /**
     * Returns `true` if active root of the current workspace is set.
     * @returns {boolean}
     */
    get opened(): boolean {
        return !!this._activeRoot;
    }

    /**
     * Opens the given URI as the current workspace root.
     */
    open(uri: URI, options?: WorkspaceInput): void {
        this.doOpen(uri, options);
    }

    /**
     * Adds a folder to the current workspace
     */
    async addFolder(uri: URI): Promise<void> {
        if (!this.opened) {
            throw new Error('Folder cannot be added as there is no active folder in the current workspace.');
        }
        const rootToAdd = uri.toString();
        const valid = await this.toValidRoot(rootToAdd);
        if (valid) {
            await this.server.addRoot(rootToAdd, this._id!);

            this.openWindow(this._activeRoot ? new URI(this._activeRoot.uri) : uri, { preserveWindow: true });
            return Promise.resolve();
        }
        throw new Error(`Invalid workspace root URI. Expected an existing directory location. URI: ${rootToAdd}.`);
    }

    protected async doOpen(uri: URI, options?: WorkspaceInput): Promise<void> {
        const rootUri = uri.toString();
        const valid = await this.toValidRoot(rootUri);
        if (valid) {
            // The same window has to be preserved too (instead of opening a new one), if the workspace root is not yet available and we are setting it for the first time.
            // Option passed as parameter has the highest priority (for api developers), then the preference, then the default.
            const { preserveWindow } = {
                preserveWindow: this.preferences['workspace.preserveWindow'] || !(await this.activeRoot),
                ...options
            };
            if (preserveWindow) {
                this._activeRoot = valid;
                this._roots = [];
            }
            await this.server.setActiveRoot(rootUri, uuid());

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
        this._activeRoot = undefined;
        this._roots = [];
        await this.server.setActiveRoot('', this._id!);
        this._id = undefined;
        this.reloadWindow();
    }

    /**
     * Removes folder(s) from workspace and reloads window.
     */
    async removeFolders(uris: URI[]): Promise<void> {
        if (!this.opened) {
            throw new Error('Folder cannot be removed as there is no active folder in the current workspace.');
        }
        const validUris: string[] = [];
        for (const uri of uris.map(u => u.toString())) {
            const valid = await this.toValidRoot(uri);
            if (valid) {
                validUris.push(uri);
            }
        }
        if (validUris.length > 0) {
            await validUris.reduce((prev, cur) => prev.then(() => this.server.removeRoot(cur, this._id!)), Promise.resolve());
            this._roots = this._roots.filter(root => validUris.indexOf(root.uri) < 0);
            if (this._activeRoot && validUris.indexOf(this._activeRoot.uri) > -1) {
                this._activeRoot = this._roots[0];
            }
            this.openWindow(this._activeRoot ? new URI(this._activeRoot.uri) : new URI(''), { preserveWindow: true });
            return Promise.resolve();
        }
        throw new Error(`Invalid workspace root URIs. Expected at least one existing directory location. URI: ${uris}.`);
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
                this._activeRoot = undefined;
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
     * Saves current workspace roots and settings (aka. preferences) into a user-designated file.
     */
    async saveWorkspaceConfigAs(newConfigFile: FileStat) {
        if (this._id) {
            const path = new URI(newConfigFile.uri).path.toString();
            await this.server.saveWorkspaceConfigAs(this._id, path);
        }
    }

    /**
     * Recreate the workspace from a workspace config file.
     */
    async loadWorkspaceFromConfig(configFile: FileStat) {
        const wsConfig = await this.server.loadWorkspaceFromConfig(new URI(configFile.uri).path.toString());
        if (wsConfig) {
            const preserveWindow = !await this.activeRoot;

            this.deferredWorkspaceId.resolve(wsConfig.id);
            this._activeRoot = await this.toValidRoot(wsConfig.activeRoot);
            this.deferredActiveRoot.resolve(this._activeRoot);

            const rootUris = wsConfig.roots;
            this._roots = [];
            for (const uri of rootUris) {
                const valid = await this.toValidRoot(uri);
                if (valid) {
                    this._roots.push(valid);
                }
            }
            this.deferredRoots.resolve(this._roots);

            this._id = wsConfig.id;
            await this.updateWorkspaceConfigFileStat();
            this.openWindow(this._activeRoot ? new URI(this._activeRoot.uri) : new URI(''), { preserveWindow });
        }
    }

    private async updateWorkspaceConfigFileStat(): Promise<void> {
        const wsConfigPath = await this.server.getWorkspaceConfigFile(this._id!);
        if (wsConfigPath !== undefined) {
            const config = await this.fileSystem.getFileStat(wsConfigPath);
            this.deferredWorkspaceConfig.resolve(config);
        } else {
            this.deferredWorkspaceConfig.resolve();
        }
    }

    /**
     * Updates the settings (aka. preferences) in the workspace config file.
     */
    async updateWorkspaceSettings(workspaceId: string | undefined, workspaceSettings: WorkspaceSettings): Promise<void> {
        console.log('updateWorkspaceSettings ' + workspaceId);
        if (workspaceId && Object.keys(workspaceSettings).length > 0) {
            console.log('call server function server.updateWorkspaceSettings');
            return this.server.updateWorkspaceSettings(workspaceId, workspaceSettings);
        }
    }
}

export interface WorkspaceInput {

    /**
     * Tests whether the same window should be used or a new one has to be opened after setting the workspace root. By default it is `false`.
     */
    preserveWindow?: boolean;

}
