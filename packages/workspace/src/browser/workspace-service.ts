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
import { WorkspaceServer } from '../common';
import { WindowService } from '@theia/core/lib/browser/window/window-service';
import { FrontendApplication, FrontendApplicationContribution } from '@theia/core/lib/browser';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { ILogger } from '@theia/core/lib/common/logger';

/**
 * The workspace service.
 */
@injectable()
export class WorkspaceService implements FrontendApplicationContribution {

    private _root: FileStat | undefined;

    private readonly deferredRoot = new Deferred<FileStat | undefined>();

    readonly root = this.deferredRoot.promise;

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

    @postConstruct()
    protected async init(): Promise<void> {
        const rootUri = await this.server.getRoot();
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
            this.server.setRoot(this._root.uri);
        }
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
            const preserveWindow = options ? options.preserveWindow : !(await this.root);
            await this.server.setRoot(rootUri);
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
        await this.server.setRoot('');
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
            const fileStat = await this.fileSystem.getFileStat(uri);
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

}

export interface WorkspaceInput {

    /**
     * Tests whether the same window should be used or a new one has to be opened after setting the workspace root. By default it is `false`.
     */
    preserveWindow?: boolean;

}
