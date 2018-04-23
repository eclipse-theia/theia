/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from 'inversify';
import URI from '@theia/core/lib/common/uri';
import { ApplicationShell, Navigatable } from '@theia/core/lib/browser';
import { VariableContribution, VariableRegistry } from '@theia/variable-resolver/lib/browser';
import { WorkspaceService } from './workspace-service';

@injectable()
export class WorkspaceVariableContribution implements VariableContribution {

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;
    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

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
        variables.registerVariable({
            name: 'file',
            description: 'The path of the currently opened file',
            resolve: () => {
                const uri = this.getCurrentURI();
                return uri ? uri.path.toString() : undefined;
            }
        });
        variables.registerVariable({
            name: 'fileBasename',
            description: 'The basename of the currently opened file',
            resolve: () => {
                const uri = this.getCurrentURI();
                return uri ? uri.path.base : undefined;
            }
        });
        variables.registerVariable({
            name: 'fileBasenameNoExtension',
            description: "The currently opened file's name without extension",
            resolve: () => {
                const uri = this.getCurrentURI();
                return uri ? uri.path.name : undefined;
            }
        });
        variables.registerVariable({
            name: 'fileDirname',
            description: "The name of the currently opened file's directory",
            resolve: () => {
                const uri = this.getCurrentURI();
                return uri ? uri.path.dir.toString() : undefined;
            }
        });
        variables.registerVariable({
            name: 'fileExtname',
            description: 'The extension of the currently opened file',
            resolve: () => {
                const uri = this.getCurrentURI();
                return uri ? uri.path.ext : undefined;
            }
        });
        variables.registerVariable({
            name: 'relativeFile',
            description: "The currently opened file's path relative to the workspace root",
            resolve: () => {
                const currentURI = this.getCurrentURI();
                return currentURI ? this.getWorkspaceRelativePath(currentURI) : undefined;
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

    protected getCurrentURI(): URI | undefined {
        const widget = this.shell.currentWidget;
        if (Navigatable.is(widget)) {
            return widget.getTargetUri();
        }
        return undefined;
    }

    protected async getWorkspaceRelativePath(uri: URI): Promise<string | undefined> {
        const workspaceRootURI = await this.getWorkspaceRootUri();
        if (!workspaceRootURI) {
            return undefined;
        }
        const workspacePath = workspaceRootURI.path.toString();
        const path = uri.path.toString();
        if (!path.startsWith(workspacePath)) {
            return undefined;
        }
        const relativePath = path.substr(workspacePath.length);
        return relativePath[0] === '/' ? relativePath.substr(1) : relativePath;
    }
}
