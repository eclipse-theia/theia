// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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

import { Path, URI } from '@theia/core';
import { codiconArray } from '@theia/core/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import {
    AIVariable,
    AIVariableContext,
    AIVariableContribution,
    AIVariableResolutionRequest,
    AIVariableResolver,
    AIVariableService,
    ResolvedAIContextVariable,
} from '../common/variable-service';

export namespace FileVariableArgs {
    export const uri = 'uri';
}

export const FILE_VARIABLE: AIVariable = {
    id: 'file-provider',
    description: 'Resolves the contents of a file',
    name: 'file',
    label: 'File',
    iconClasses: codiconArray('file'),
    isContextVariable: true,
    args: [{ name: FileVariableArgs.uri, description: 'The URI of the requested file.' }]
};

@injectable()
export class FileVariableContribution implements AIVariableContribution, AIVariableResolver {
    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(WorkspaceService)
    protected readonly wsService: WorkspaceService;

    registerVariables(service: AIVariableService): void {
        service.registerResolver(FILE_VARIABLE, this);
    }

    async canResolve(request: AIVariableResolutionRequest, _: AIVariableContext): Promise<number> {
        return request.variable.name === FILE_VARIABLE.name ? 1 : 0;
    }

    async resolve(request: AIVariableResolutionRequest, _: AIVariableContext): Promise<ResolvedAIContextVariable | undefined> {
        if (request.variable.name !== FILE_VARIABLE.name || request.arg === undefined) {
            return undefined;
        }

        const path = request.arg;
        const absoluteUri = await this.makeAbsolute(path);
        if (!absoluteUri) {
            return undefined;
        }

        try {
            const content = await this.fileService.readFile(absoluteUri);
            return {
                variable: request.variable,
                value: await this.wsService.getWorkspaceRelativePath(absoluteUri),
                contextValue: content.value.toString(),
            };
        } catch (error) {
            return undefined;
        }
    }

    protected async makeAbsolute(pathStr: string): Promise<URI | undefined> {
        const path = new Path(Path.normalizePathSeparator(pathStr));
        if (!path.isAbsolute) {
            const workspaceRoots = this.wsService.tryGetRoots();
            const wsUris = workspaceRoots.map(root => root.resource.resolve(path));
            for (const uri of wsUris) {
                if (await this.fileService.exists(uri)) {
                    return uri;
                }
            }
        }
        const argUri = new URI(pathStr);
        if (await this.fileService.exists(argUri)) {
            return argUri;
        }
        return undefined;
    }
}
