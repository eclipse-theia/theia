// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

import {
    AIVariable, AIVariableContext, AIVariableContribution, AIVariableResolutionRequest, AIVariableResolver, AIVariableService, ResolvedAIVariable
} from '@theia/ai-core/lib/common';
import { MaybePromise, URI, nls } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { WorkspaceMetadataStorageService, WorkspaceMetadataStore } from '@theia/workspace/lib/browser/metadata-storage';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { AccessibleRootContribution } from './workspace-functions';

/** Key under which the memory directory is requested from the workspace metadata storage. */
export const MEMORY_METADATA_STORE_KEY = 'memory';

export const MEMORY_DIRECTORY_VARIABLE: AIVariable = {
    id: 'memory-directory',
    name: 'memoryDirectory',
    description: nls.localize('theia/ai/ide/memoryDirectoryVariable/description',
        'The absolute path of the directory in which the agent keeps its memory for the current workspace.')
};

/**
 * Resolves the memory directory of the current workspace and makes it reachable for the AI workspace
 * tools. The directory is the workspace's metadata store, so every workspace has its own memory and none
 * of it ends up in the user's repository.
 *
 * Its path is generated and changes with the workspace, which is why it is contributed as an accessible
 * root instead of being configured in `ai-features.workspaceFunctions.allowedExternalPaths`: the user
 * cannot name a path they do not know, and prompts learn it from {@link MEMORY_DIRECTORY_VARIABLE}.
 *
 * A window without a workspace has no metadata store and therefore no memory. The variable then resolves
 * to nothing and no directory is made accessible.
 */
@injectable()
export class MemoryDirectoryVariableContribution implements AIVariableContribution, AIVariableResolver, AccessibleRootContribution {

    @inject(WorkspaceMetadataStorageService)
    protected readonly metadataStorageService: WorkspaceMetadataStorageService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    protected store: WorkspaceMetadataStore | undefined;
    protected ensuredLocation: string | undefined;

    registerVariables(service: AIVariableService): void {
        service.registerResolver(MEMORY_DIRECTORY_VARIABLE, this);
    }

    canResolve(request: AIVariableResolutionRequest, context: AIVariableContext): MaybePromise<number> {
        return request.variable.name === MEMORY_DIRECTORY_VARIABLE.name ? 1 : 0;
    }

    async resolve(request: AIVariableResolutionRequest, context: AIVariableContext): Promise<ResolvedAIVariable | undefined> {
        if (request.variable.name !== MEMORY_DIRECTORY_VARIABLE.name) {
            return undefined;
        }
        const store = await this.getStore();
        if (!store) {
            return undefined;
        }
        // Resolving the variable means a prompt is about to send the agent to this directory, so create
        // it now: listing an empty memory is a clearer answer than a missing path.
        if (this.ensuredLocation !== store.location.toString()) {
            await store.ensureExists();
            this.ensuredLocation = store.location.toString();
        }
        return { variable: request.variable, value: store.location.path.fsPath() };
    }

    async getRoots(): Promise<URI[]> {
        const store = await this.getStore();
        return store ? [store.location] : [];
    }

    /**
     * The memory store of the current workspace, or undefined when there is no workspace to store
     * memory for. The store instance is kept because it tracks the workspace itself: its `location`
     * follows a workspace change, so nothing has to be invalidated when the workspace is replaced.
     *
     * Closing a workspace is the exception: the store cannot compute a location without one, so it
     * keeps the location of the closed workspace. Whether a workspace is open is therefore checked on
     * every call rather than only when the store is created.
     */
    protected async getStore(): Promise<WorkspaceMetadataStore | undefined> {
        if (this.workspaceService.tryGetRoots().length === 0) {
            return undefined;
        }
        try {
            if (!this.store) {
                this.store = await this.metadataStorageService.getOrCreateStore(MEMORY_METADATA_STORE_KEY);
            }
            return this.store;
        } catch (error) {
            // No workspace is open: memory is unavailable rather than shared between unrelated windows.
            return undefined;
        }
    }
}
