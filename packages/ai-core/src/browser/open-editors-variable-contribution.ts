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

import { MaybePromise, nls } from '@theia/core';
import { injectable, inject } from '@theia/core/shared/inversify';
import { EditorManager } from '@theia/editor/lib/browser';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import URI from '@theia/core/lib/common/uri';
import { AIVariable, ResolvedAIVariable, AIVariableContribution, AIVariableResolver, AIVariableService, AIVariableResolutionRequest, AIVariableContext } from '../common';

export const OPEN_EDITORS_VARIABLE: AIVariable = {
    id: 'openEditors',
    description: nls.localize('theia/ai/core/openEditorsVariable/description', 'A comma-separated list of all currently open files, relative to the workspace root.'),
    name: 'openEditors',
};

export const OPEN_EDITORS_SHORT_VARIABLE: AIVariable = {
    id: 'openEditorsShort',
    description: nls.localize('theia/ai/core/openEditorsShortVariable/description', 'Short reference to all currently open files (relative paths, comma-separated)'),
    name: '_ff',
};

@injectable()
export class OpenEditorsVariableContribution implements AIVariableContribution, AIVariableResolver {

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    registerVariables(service: AIVariableService): void {
        service.registerResolver(OPEN_EDITORS_VARIABLE, this);
        service.registerResolver(OPEN_EDITORS_SHORT_VARIABLE, this);
    }

    canResolve(request: AIVariableResolutionRequest, _context: AIVariableContext): MaybePromise<number> {
        return (request.variable.name === OPEN_EDITORS_VARIABLE.name || request.variable.name === OPEN_EDITORS_SHORT_VARIABLE.name) ? 50 : 0;
    }

    async resolve(request: AIVariableResolutionRequest, _context: AIVariableContext): Promise<ResolvedAIVariable | undefined> {
        if (request.variable.name !== OPEN_EDITORS_VARIABLE.name && request.variable.name !== OPEN_EDITORS_SHORT_VARIABLE.name) {
            return undefined;
        }

        const openFiles = this.getAllOpenFilesRelative();
        return {
            variable: request.variable,
            value: openFiles
        };
    }

    protected getAllOpenFilesRelative(): string {
        const openFiles: string[] = [];

        // Get all open editors from the editor manager
        for (const editor of this.editorManager.all) {
            const uri = editor.getResourceUri();
            if (uri) {
                const relativePath = this.getWorkspaceRelativePath(uri);
                if (relativePath) {
                    openFiles.push(`'${relativePath}'`);
                }
            }
        }

        return openFiles.join(', ');
    }

    protected getWorkspaceRelativePath(uri: URI): string | undefined {
        const workspaceRootUri = this.workspaceService.getWorkspaceRootUri(uri);
        const path = workspaceRootUri && workspaceRootUri.path.relative(uri.path);
        return path && path.toString();
    }
}
