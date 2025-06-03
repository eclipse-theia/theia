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

import { AIVariable, AIVariableContext, AIVariableContribution, AIVariableResolutionRequest, AIVariableResolver, ResolvedAIContextVariable } from '@theia/ai-core';
import { FrontendVariableService } from '@theia/ai-core/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';
import { codiconArray } from '@theia/core/lib/browser';
import { MonacoEditorProvider } from '@theia/monaco/lib/browser/monaco-editor-provider';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';

export const EDITOR_CONTEXT_VARIABLE: AIVariable = {
    id: 'editorContext',
    description: 'Resolves editor specific context information',
    name: 'editorContext',
    label: 'EditorContext',
    iconClasses: codiconArray('file'),
    isContextVariable: true,
    args: []
};

@injectable()
export class EditorContextVariableContribution implements AIVariableContribution, AIVariableResolver {

    @inject(MonacoEditorProvider)
    protected readonly monacoEditors: MonacoEditorProvider;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    registerVariables(service: FrontendVariableService): void {
        service.registerResolver(EDITOR_CONTEXT_VARIABLE, this);
    }

    async canResolve(request: AIVariableResolutionRequest, _: AIVariableContext): Promise<number> {
        return request.variable.name === EDITOR_CONTEXT_VARIABLE.name ? 1 : 0;
    }

    async resolve(request: AIVariableResolutionRequest, _: AIVariableContext): Promise<ResolvedAIContextVariable | undefined> {
        const editor = this.monacoEditors.current;
        if (!editor) {
            return undefined;
        }

        const model = editor.getControl().getModel();
        const selection = editor.getControl().getSelection();

        if (!model || !selection) {
            return undefined;
        }

        // Extract file information
        const uri = editor.getResourceUri();
        const languageId = model.getLanguageId();

        // Extract selection information
        const selectedText = model.getValueInRange(selection);
        const hasSelection = !selection.isEmpty();

        // Text position information
        const position = editor.getControl().getPosition();
        const lineNumber = position ? position.lineNumber : 0;
        const column = position ? position.column : 0;

        // Get workspace-relative path
        const workspaceRelativePath = uri ? await this.workspaceService.getWorkspaceRelativePath(uri) : '';

        // Create contextValue with all editor information
        const contextValue = ` 
        Metadata provided by the user:
        ${JSON.stringify({
            file: {
                uri: workspaceRelativePath,
                languageId,
                fileName: uri ? uri.path.base : ''
            },
            selection: {
                text: selectedText,
                isEmpty: !hasSelection,
                startLineNumber: selection.startLineNumber,
                startColumn: selection.startColumn,
                endLineNumber: selection.endLineNumber,
                endColumn: selection.endColumn
            },
            position: {
                lineNumber,
                column,
                lineContent: position ? model.getLineContent(position.lineNumber) : ''
            }
        }, undefined, 2)}`;

        return {
            variable: request.variable,
            value: contextValue, // Simplified visible value
            contextValue // Full detailed context for AI processing
        };
    }
}
