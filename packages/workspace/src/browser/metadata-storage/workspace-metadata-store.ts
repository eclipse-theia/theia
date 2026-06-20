/********************************************************************************
 * Copyright (C) 2026 EclipseSource and others.
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
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
 ********************************************************************************/

import { inject, injectable, named, postConstruct } from '@theia/core/shared/inversify';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { ILogger, Emitter, Event, Disposable, DisposableCollection, URI } from '@theia/core/lib/common';
import { WorkspaceService } from '../workspace-service';

/**
 * Represents a metadata store for a specific key within a workspace.
 * The store provides access to a dedicated directory for storing workspace-specific metadata.
 */
export interface WorkspaceMetadataStore extends Disposable {
    /**
     * The key identifying this metadata store.
     */
    readonly key: string;

    /**
     * The URI location of the metadata store directory.
     */
    readonly location: URI;

    /**
     * Event that fires when the location of the metadata store changes.
     * It is the client's responsibility to reload or reinitialize any metadata from
     * or in the new location.
     */
    readonly onDidChangeLocation: Event<URI>;

    /**
     * Ensures that the metadata store directory exists on disk.
     * Creates the directory if it doesn't exist.
     */
    ensureExists(): Promise<void>;

    /**
     * Deletes the metadata store directory and all of its contents.
     */
    delete(): Promise<void>;
}

/**
 * Implementation of WorkspaceMetadataStore.
 * @internal
 */
@injectable()
export class WorkspaceMetadataStoreImpl implements WorkspaceMetadataStore {

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(ILogger) @named('WorkspaceMetadataStorage')
    protected readonly logger: ILogger;

    protected readonly toDispose = new DisposableCollection();

    protected readonly onDidChangeLocationEmitter = new Emitter<URI>();
    readonly onDidChangeLocation: Event<URI> = this.onDidChangeLocationEmitter.event;

    protected _location: URI;
    protected _key: string;
    protected currentWorkspaceRoot?: URI;
    protected locationProvider: () => Promise<URI>;
    protected onDisposeCallback?: () => void;

    get location(): URI {
        return this._location;
    }

    get key(): string {
        return this._key;
    }

    /**
     * Initializes the WorkspaceMetadataStore.
     * @param key The key identifying this store
     * @param initialLocation The initial location URI
     * @param locationProvider Function to resolve the current location based on workspace changes
     * @param onDispose Callback invoked when the store is disposed
     */
    initialize(key: string, initialLocation: URI, locationProvider: () => Promise<URI>, onDispose?: () => void): void {
        this._key = key;
        this._location = initialLocation;
        this.locationProvider = locationProvider;
        this.onDisposeCallback = onDispose;
        this.currentWorkspaceRoot = this.getFirstWorkspaceRoot();
    }

    @postConstruct()
    protected init(): void {
        this.toDispose.push(this.onDidChangeLocationEmitter);
        this.toDispose.push(
            this.workspaceService.onWorkspaceChanged(() => this.handleWorkspaceChange())
        );
    }

    protected async handleWorkspaceChange(): Promise<void> {
        const newWorkspaceRoot = this.getFirstWorkspaceRoot();

        // Check if the first workspace root actually changed
        if (this.currentWorkspaceRoot?.toString() !== newWorkspaceRoot?.toString()) {
            this.currentWorkspaceRoot = newWorkspaceRoot;

            try {
                const newLocation = await this.locationProvider();
                if (this._location.toString() !== newLocation.toString()) {
                    this._location = newLocation;
                    this.onDidChangeLocationEmitter.fire(newLocation);
                    this.logger.debug(`Metadata store location changed for key '${this._key}'`, {
                        newLocation: newLocation.toString()
                    });
                }
            } catch (error) {
                this.logger.error(`Failed to update location for metadata store '${this._key}'`, error);
            }
        }
    }

    protected getFirstWorkspaceRoot(): URI | undefined {
        const roots = this.workspaceService.tryGetRoots();
        return roots.length > 0 ? roots[0].resource : undefined;
    }

    async ensureExists(): Promise<void> {
        try {
            await this.fileService.createFolder(this._location);
            this.logger.debug(`Ensured metadata store exists for key '${this._key}'`, {
                location: this._location.toString()
            });
        } catch (error) {
            this.logger.error(`Failed to create metadata store directory for key '${this._key}'`, error);
            throw error;
        }
    }

    async delete(): Promise<void> {
        try {
            const exists = await this.fileService.exists(this._location);
            if (exists) {
                await this.fileService.delete(this._location, { recursive: true, useTrash: false });
                this.logger.debug(`Deleted metadata store for key '${this._key}'`, {
                    location: this._location.toString()
                });
            }
        } catch (error) {
            this.logger.error(`Failed to delete metadata store directory for key '${this._key}'`, error);
            throw error;
        }
    }

    dispose(): void {
        this.toDispose.dispose();
        this.onDisposeCallback?.();
    }
}
