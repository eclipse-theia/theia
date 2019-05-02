/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { injectable, inject, postConstruct } from 'inversify';
import URI from '@theia/core/lib/common/uri';
import { ApplicationShell, NavigatableWidget } from '@theia/core/lib/browser';
import { VariableContribution, VariableRegistry } from '@theia/variable-resolver/lib/browser';
import { WorkspaceService } from './workspace-service';

@injectable()
export class WorkspaceVariableContribution implements VariableContribution {

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;
    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    protected currentWidget: NavigatableWidget | undefined;

    @postConstruct()
    protected init(): void {
        this.updateCurrentWidget();
        this.shell.currentChanged.connect(() => this.updateCurrentWidget());
    }
    protected updateCurrentWidget(): void {
        const { currentWidget } = this.shell;
        if (NavigatableWidget.is(currentWidget)) {
            this.currentWidget = currentWidget;
        }
    }

    registerVariables(variables: VariableRegistry): void {
        variables.registerVariable({
            name: 'workspaceRoot',
            description: 'The path of the workspace root folder',
            resolve: (context?: URI) => {
                const uri = this.getWorkspaceRootUri(context);
                return uri && uri.path.toString();
            }
        });
        variables.registerVariable({
            name: 'workspaceFolder',
            description: 'The path of the workspace root folder',
            resolve: (context?: URI) => {
                const uri = this.getWorkspaceRootUri(context);
                return uri && uri.path.toString();
            }
        });
        variables.registerVariable({
            name: 'workspaceFolderBasename',
            description: 'The name of the workspace root folder',
            resolve: (context?: URI) => {
                const uri = this.getWorkspaceRootUri(context);
                return uri && uri.displayName;
            }
        });
        variables.registerVariable({
            name: 'file',
            description: 'The path of the currently opened file',
            resolve: () => {
                const uri = this.getResourceUri();
                return uri && uri.path.toString();
            }
        });
        variables.registerVariable({
            name: 'fileBasename',
            description: 'The basename of the currently opened file',
            resolve: () => {
                const uri = this.getResourceUri();
                return uri && uri.path.base;
            }
        });
        variables.registerVariable({
            name: 'fileBasenameNoExtension',
            description: "The currently opened file's name without extension",
            resolve: () => {
                const uri = this.getResourceUri();
                return uri && uri.path.name;
            }
        });
        variables.registerVariable({
            name: 'fileDirname',
            description: "The name of the currently opened file's directory",
            resolve: () => {
                const uri = this.getResourceUri();
                return uri && uri.path.dir.toString();
            }
        });
        variables.registerVariable({
            name: 'fileExtname',
            description: 'The extension of the currently opened file',
            resolve: () => {
                const uri = this.getResourceUri();
                return uri && uri.path.ext;
            }
        });
        variables.registerVariable({
            name: 'relativeFile',
            description: "The currently opened file's path relative to the workspace root",
            resolve: () => {
                const uri = this.getResourceUri();
                return uri && this.getWorkspaceRelativePath(uri);
            }
        });
    }

    getWorkspaceRootUri(uri: URI | undefined = this.getResourceUri()): URI | undefined {
        return this.workspaceService.getWorkspaceRootUri(uri);
    }

    getResourceUri(): URI | undefined {
        return this.currentWidget && this.currentWidget.getResourceUri();
    }

    getWorkspaceRelativePath(uri: URI): string | undefined {
        const workspaceRootUri = this.getWorkspaceRootUri(uri);
        const path = workspaceRootUri && workspaceRootUri.path.relative(uri.path);
        return path && path.toString();
    }
}
