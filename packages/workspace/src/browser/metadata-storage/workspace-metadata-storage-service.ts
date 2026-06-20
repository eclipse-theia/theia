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

import { inject, injectable, named } from '@theia/core/shared/inversify';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import { ILogger } from '@theia/core/lib/common/logger';
import { URI } from '@theia/core/lib/common/uri';
import { generateUuid } from '@theia/core/lib/common/uuid';
import { BinaryBuffer } from '@theia/core/lib/common/buffer';
import { WorkspaceService } from '../workspace-service';
import { WorkspaceMetadataStore, WorkspaceMetadataStoreImpl } from './workspace-metadata-store';

export const WorkspaceMetadataStoreFactory = Symbol('WorkspaceMetadataStoreFactory');
export type WorkspaceMetadataStoreFactory = () => WorkspaceMetadataStoreImpl;

/**
 * Index mapping workspace root paths to UUIDs.
 * Stored at $CONFIGDIR/workspace-metadata/index.json
 */
export interface WorkspaceMetadataIndex {
    [workspacePath: string]: string; // workspace path -> UUID
}

/**
 * Service for managing workspace-specific metadata storage.
 * Provides isolated storage directories for different features within a workspace.
 *
 * This is different to the `WorkspaceStorageService` in that it is an unlimited free-form
 * storage area _in the filesystem_ and not in the browser's local storage.
 */
export const WorkspaceMetadataStorageService = Symbol('WorkspaceMetadataStorageService');
export interface WorkspaceMetadataStorageService {
    /**
     * Gets an existing metadata store for the given key, or creates a new one if it doesn't exist.
     *
     * @param key A unique identifier for the metadata store. Special characters will be replaced with hyphens.
     * @returns The existing or newly created WorkspaceMetadataStore instance
     * @throws Error if no workspace is currently open
     */
    getOrCreateStore(key: string): Promise<WorkspaceMetadataStore>;
}

@injectable()
export class WorkspaceMetadataStorageServiceImpl implements WorkspaceMetadataStorageService {

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(EnvVariablesServer)
    protected readonly envVariableServer: EnvVariablesServer;

    @inject(ILogger) @named('WorkspaceMetadataStorage')
    protected readonly logger: ILogger;

    @inject(WorkspaceMetadataStoreFactory)
    protected readonly storeFactory: WorkspaceMetadataStoreFactory;

    /**
     * Registry of created stores by their mangled keys
     */
    protected readonly stores = new Map<string, WorkspaceMetadataStore>();

    /**
     * Cached metadata root directory (e.g., file://$CONFIGDIR/workspace-metadata/)
     */
    protected metadataRoot?: URI;

    /**
     * Cached index file location
     */
    protected indexFile?: URI;

    async getOrCreateStore(key: string): Promise<WorkspaceMetadataStore> {
        const mangledKey = this.mangleKey(key);

        const existingStore = this.stores.get(mangledKey);
        if (existingStore) {
            this.logger.debug(`Returning existing metadata store for key '${key}'`, {
                mangledKey,
                location: existingStore.location.toString()
            });
            return existingStore;
        }

        return this.doCreateStore(key, mangledKey);
    }

    protected async doCreateStore(key: string, mangledKey: string): Promise<WorkspaceMetadataStore> {
        const workspaceRoot = this.getFirstWorkspaceRoot();
        if (!workspaceRoot) {
            throw new Error('Cannot create metadata store: no workspace is currently open');
        }

        const workspaceUuid = await this.getOrCreateWorkspaceUUID(workspaceRoot);
        const storeLocation = await this.getStoreLocation(workspaceUuid, mangledKey);
        const store = this.storeFactory();

        store.initialize(
            mangledKey,
            storeLocation,
            async () => this.resolveStoreLocation(mangledKey),
            () => this.stores.delete(mangledKey)
        );

        this.stores.set(mangledKey, store);

        this.logger.debug(`Created metadata store for key '${key}'`, {
            mangledKey,
            location: storeLocation.toString()
        });

        return store;
    }

    /**
     * Mangles a key to make it safe for use as a directory name.
     * Replaces all characters except alphanumerics, hyphens, and underscores with hyphens.
     */
    protected mangleKey(key: string): string {
        return key.replace(/[^a-zA-Z0-9-_]/g, '-');
    }

    protected getFirstWorkspaceRoot(): URI | undefined {
        const roots = this.workspaceService.tryGetRoots();
        return roots.length > 0 ? roots[0].resource : undefined;
    }

    /**
     * Gets or creates a UUID for the given workspace root.
     * UUIDs are stored in an index file and reused if the same workspace is opened again.
     */
    protected async getOrCreateWorkspaceUUID(workspaceRoot: URI): Promise<string> {
        const index = await this.loadIndex();
        const workspacePath = workspaceRoot.path.toString();

        if (index[workspacePath]) {
            return index[workspacePath];
        }

        const newUuid = generateUuid();
        index[workspacePath] = newUuid;

        await this.saveIndex(index);

        this.logger.debug('Generated new UUID for workspace', {
            workspacePath,
            uuid: newUuid
        });

        return newUuid;
    }

    protected async loadIndex(): Promise<WorkspaceMetadataIndex> {
        const indexFileUri = await this.getIndexFile();

        try {
            const exists = await this.fileService.exists(indexFileUri);
            if (!exists) {
                return {};
            }

            const content = await this.fileService.readFile(indexFileUri);
            return JSON.parse(content.value.toString()) as WorkspaceMetadataIndex;
        } catch (error) {
            this.logger.warn('Failed to load workspace metadata index, using empty index', error);
            return {};
        }
    }

    protected async saveIndex(index: WorkspaceMetadataIndex): Promise<void> {
        const indexFileUri = await this.getIndexFile();

        try {
            // Ensure metadata root exists
            const metadataRootUri = await this.getMetadataRoot();
            await this.fileService.createFolder(metadataRootUri);

            // Write index file
            const content = JSON.stringify(index, undefined, 2);
            await this.fileService.writeFile(
                indexFileUri,
                BinaryBuffer.fromString(content)
            );
        } catch (error) {
            this.logger.error('Failed to save workspace metadata index', error);
            throw error;
        }
    }

    protected async getMetadataRoot(): Promise<URI> {
        if (!this.metadataRoot) {
            const configDirUri = await this.envVariableServer.getConfigDirUri();
            this.metadataRoot = new URI(configDirUri).resolve('workspace-metadata');
        }
        return this.metadataRoot;
    }

    protected async getIndexFile(): Promise<URI> {
        if (!this.indexFile) {
            const metadataRoot = await this.getMetadataRoot();
            this.indexFile = metadataRoot.resolve('index.json');
        }
        return this.indexFile;
    }

    /**
     * Gets the location for a store given a workspace UUID and mangled key.
     */
    protected async getStoreLocation(workspaceUuid: string, mangledKey: string): Promise<URI> {
        const metadataRoot = await this.getMetadataRoot();
        return metadataRoot.resolve(workspaceUuid).resolve(mangledKey);
    }

    /**
     * Resolves the current store location for a given mangled key.
     * Used when workspace changes to get the new location.
     */
    protected async resolveStoreLocation(mangledKey: string): Promise<URI> {
        const workspaceRoot = this.getFirstWorkspaceRoot();
        if (!workspaceRoot) {
            throw new Error('No workspace is currently open');
        }

        const workspaceUuid = await this.getOrCreateWorkspaceUUID(workspaceRoot);
        return this.getStoreLocation(workspaceUuid, mangledKey);
    }
}
