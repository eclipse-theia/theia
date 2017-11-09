/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import URI from "@theia/core/lib/common/uri";
import { FileSystem, FileStat, FileSystemWatcher } from "@theia/filesystem/lib/common";
import { WorkspaceServer } from "../common";

/**
 * The workspace service.
 */
@injectable()
export class WorkspaceService {

    constructor(
        @inject(FileSystem) protected readonly fileSystem: FileSystem,
        @inject(FileSystemWatcher) protected readonly watcher: FileSystemWatcher,
        @inject(WorkspaceServer) protected readonly server: WorkspaceServer
    ) {
        (async () => {
            const root = await this.tryRoot;
            if (root) {
                const uri = new URI(root.uri);
                this.updateTitle(uri);
                watcher.watchFileChanges(uri);
            }
        })();
    }

    protected updateTitle(uri: URI): void {
        document.title = uri.displayName;
    }

    /**
     * Unlike [root](WorkspaceService.root), this method gets resolved even if the workspace root URI is not yet set on the backend or if it
     * is invalid. In such cases, it will resolve to `undefined`.
     */
    get tryRoot(): Promise<FileStat | undefined> {
        return new Promise(async resolve => {
            const root = await this.server.getRoot();
            const validRoot = await this.isValidRoot(root);
            // If the workspace root is either not set or invalid, we resolve the promise with `undefined`.
            resolve(validRoot ? this.toFileStat(root!) : undefined);
        });
    }

    /**
     * Opens the given URI as the current workspace root.
     */
    open(uri: URI, options?: WorkspaceInput): void {
        this.doOpen(uri, options);
    }

    protected async doOpen(uri: URI, options?: WorkspaceInput): Promise<void> {
        const rootUri = uri.toString();
        const valid = await this.isValidRoot(rootUri);
        if (valid) {
            // The same window has to be preserved too (instead of opening a new one), if the workspace root is not yet available and we are setting it for the first time.
            const preserveWindow = !(await this.tryRoot);
            await this.server.setRoot(rootUri);
            this.openWindow(uri, Object.assign(options || {}, { preserveWindow }));
            return;
        }
        throw new Error(`Invalid workspace root URI. Expected an existing directory location. URI: ${rootUri}.`);
    }

    /**
     * `true` if the argument URI points to an existing directory. Otherwise, `false`.
     */
    protected async isValidRoot(uri: string | undefined): Promise<boolean> {
        if (!uri) {
            return false;
        }
        try {
            const fileStat = await this.fileSystem.getFileStat(uri);
            return fileStat.isDirectory;
        } catch (error) {
            return false;
        }
    }

    /**
     * Transforms the `uri` argument into a [FileStat](FileStat). If the given URI argument is invalid, then the promise will be rejected.
     */
    protected async toFileStat(uri: string): Promise<FileStat> {
        const valid = await this.isValidRoot(uri);
        if (valid) {
            return this.fileSystem.getFileStat(uri);
        }
        throw new Error(`Invalid workspace root URI. Expected an existing directory location. URI: ${uri}.`);
    }

    protected openWindow(uri: URI, options?: WorkspaceInput): void {
        if (this.shouldPreserveWindow(options)) {
            this.reloadWindow();
        } else {
            this.openNewWindow();
        }
    }

    protected reloadWindow(): void {
        window.location.reload();
    }

    protected openNewWindow(): void {
        window.open(window.location.href);
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
