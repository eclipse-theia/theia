/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import URI from "../../application/common/uri";
import { WorkspaceServer } from "../common";
import { FileSystem, FileStat, FileSystemWatcher } from "../../filesystem/common";

/**
 * The workspace service.
 */
@injectable()
export class WorkspaceService {

    /**
     * The current workspace root.
     */
    readonly root: Promise<FileStat>;

    constructor(
        @inject(FileSystem) protected readonly fileSystem: FileSystem,
        @inject(FileSystemWatcher) protected readonly watcher: FileSystemWatcher,
        @inject(WorkspaceServer) protected readonly server: WorkspaceServer
    ) {
        this.root = this.server.getRoot().then(uri =>
            this.validateRoot(uri)
        );
        this.root.then(root =>
            watcher.watchFileChanges(new URI(root.uri))
        );
    }

    /**
     * Open a given URI as the current workspace root.
     */
    open(uri: URI, options?: WorkspaceInput): void {
        this.validateRoot(uri.toString())
            .then(fileStat => this.server.setRoot(fileStat.uri))
            .then(() => this.openWindow(uri, options));
    }

    protected validateRoot(uri: string): Promise<FileStat> {
        return this.fileSystem.getFileStat(uri).then(fileStat => {
            if (!fileStat.isDirectory) {
                throw new Error('A uri should point to the directory, uri: ' + uri);
            }
            return fileStat;
        });
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
        if (options === undefined || options.preserveWindow === undefined) {
            return false;
        }
        return options.preserveWindow;
    }

}

export interface WorkspaceInput {
    /**
     * Test whether the same window should be used, by default false.
     */
    preserveWindow?: boolean;
}