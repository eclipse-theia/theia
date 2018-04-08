/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from 'inversify';
import { VariableContribution, VariableRegistry } from '@theia/core/lib/browser';
import { WorkspaceService } from './workspace-service';
import URI from '@theia/core/lib/common/uri';

@injectable()
export class WorkspaceVariableContribution implements VariableContribution {

    constructor(
        @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService
    ) { }

    registerVariables(variables: VariableRegistry): void {
        variables.registerVariable({
            name: 'workspaceFolder',
            description: 'The path of the workspace root folder',
            resolve: async () => {
                const uri = await this.getWorkspaceRootUri();
                return uri ? uri.path.toString() : undefined;
            }
        });
        variables.registerVariable({
            name: 'workspaceFolderBasename',
            description: 'The name of the workspace root folder',
            resolve: async () => {
                const uri = await this.getWorkspaceRootUri();
                return uri ? uri.displayName : undefined;
            }
        });
    }

    protected async getWorkspaceRootUri(): Promise<URI | undefined> {
        const wsRoot = await this.workspaceService.root;
        if (wsRoot) {
            return new URI(wsRoot.uri);
        }
        return undefined;
    }
}
