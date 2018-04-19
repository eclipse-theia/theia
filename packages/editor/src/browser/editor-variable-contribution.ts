/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from 'inversify';
import { VariableRegistry, VariableContribution } from '@theia/variable-resolver/lib/browser';
import { TextEditor } from './editor';
import { EditorManager } from './editor-manager';
import { WorkspaceService } from '@theia/workspace/lib/browser';

@injectable()
export class EditorVariableContribution implements VariableContribution {

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    registerVariables(variables: VariableRegistry): void {
        variables.registerVariable({
            name: 'file',
            description: 'The path of the currently opened file',
            resolve: () => {
                const currentEditor = this.getCurrentEditor();
                if (!currentEditor) {
                    return undefined;
                }
                return currentEditor.uri.path.toString();
            }
        });
        variables.registerVariable({
            name: 'fileBasename',
            description: 'The basename of the currently opened file',
            resolve: () => {
                const currentEditor = this.getCurrentEditor();
                if (!currentEditor) {
                    return undefined;
                }
                return currentEditor.uri.path.base;
            }
        });
        variables.registerVariable({
            name: 'fileBasenameNoExtension',
            description: "The currently opened file's name without extension",
            resolve: () => {
                const currentEditor = this.getCurrentEditor();
                if (!currentEditor) {
                    return undefined;
                }
                return currentEditor.uri.path.name;
            }
        });
        variables.registerVariable({
            name: 'fileDirname',
            description: "The name of the currently opened file's directory",
            resolve: () => {
                const currentEditor = this.getCurrentEditor();
                if (!currentEditor) {
                    return undefined;
                }
                return currentEditor.uri.path.dir.toString();
            }
        });
        variables.registerVariable({
            name: 'fileExtname',
            description: 'The extension of the currently opened file',
            resolve: () => {
                const currentEditor = this.getCurrentEditor();
                if (!currentEditor) {
                    return undefined;
                }
                return currentEditor.uri.path.ext;
            }
        });
        variables.registerVariable({
            name: 'relativeFile',
            description: "The currently opened file's path relative to the workspace root",
            resolve: async () => {
                const workspaceRootUri = await this.getWorkspaceRootUri();
                const currentEditor = this.getCurrentEditor();
                if (!workspaceRootUri || !currentEditor) {
                    return undefined;
                }
                return currentEditor.uri.toString().slice(workspaceRootUri.length + 1); // + 1 so that it removes the beginning slash
            }
        });
        variables.registerVariable({
            name: 'lineNumber',
            description: 'The current line number in the currently opened file',
            resolve: () => {
                const currentEditor = this.getCurrentEditor();
                if (!currentEditor) {
                    return undefined;
                }
                return `${currentEditor.cursor.line + 1}`;
            }
        });
    }

    protected getCurrentEditor(): TextEditor | undefined {
        const currentEditor = this.editorManager.currentEditor;
        if (!currentEditor) {
            return undefined;
        }
        return currentEditor.editor;
    }

    protected async getWorkspaceRootUri(): Promise<string | undefined> {
        const wsRoot = await this.workspaceService.root;
        if (!wsRoot) {
            return undefined;
        }
        return wsRoot.uri;
    }
}
