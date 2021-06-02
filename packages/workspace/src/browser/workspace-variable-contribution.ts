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

import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import URI from '@theia/core/lib/common/uri';
import { Path } from '@theia/core/lib/common/path';
import { ApplicationShell, NavigatableWidget, WidgetManager } from '@theia/core/lib/browser';
import { VariableContribution, VariableRegistry, Variable } from '@theia/variable-resolver/lib/browser';
import { WorkspaceService } from './workspace-service';
import { FileService } from '@theia/filesystem/lib/browser/file-service';

@injectable()
export class WorkspaceVariableContribution implements VariableContribution {

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;
    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;
    @inject(FileService)
    protected readonly fileService: FileService;
    @inject(WidgetManager)
    protected readonly widgetManager: WidgetManager;

    protected currentWidget: NavigatableWidget | undefined;

    @postConstruct()
    protected init(): void {
        this.shell.currentChanged.connect(() => this.updateCurrentWidget());
        this.widgetManager.onDidCreateWidget(({ widget }) => {
            if (NavigatableWidget.is(widget)) {
                widget.onDidChangeVisibility(() => {
                    if (widget.isVisible) {
                        this.addRecentlyVisible(widget);
                    } else {
                        this.removeRecentlyVisible(widget);
                    }
                    this.updateCurrentWidget();
                });
                widget.onDidDispose(() => {
                    this.removeRecentlyVisible(widget);
                    this.updateCurrentWidget();
                });
            }
        });
        for (const widget of this.shell.widgets) {
            if (NavigatableWidget.is(widget) && widget.isVisible) {
                this.addRecentlyVisible(widget);
            }
        }
        this.updateCurrentWidget();
    }

    protected readonly recentlyVisibleIds: string[] = [];
    protected get recentlyVisible(): NavigatableWidget | undefined {
        const id = this.recentlyVisibleIds[0];
        const widget = id && this.shell.getWidgetById(id) || undefined;
        if (NavigatableWidget.is(widget)) {
            return widget;
        }
        return undefined;
    }
    protected addRecentlyVisible(widget: NavigatableWidget): void {
        this.removeRecentlyVisible(widget);
        this.recentlyVisibleIds.unshift(widget.id);
    }
    protected removeRecentlyVisible(widget: NavigatableWidget): void {
        const index = this.recentlyVisibleIds.indexOf(widget.id);
        if (index !== -1) {
            this.recentlyVisibleIds.splice(index, 1);
        }
    }

    protected updateCurrentWidget(): void {
        const { currentWidget } = this.shell;
        if (NavigatableWidget.is(currentWidget)) {
            this.currentWidget = currentWidget;
        } else if (!this.currentWidget || !this.currentWidget.isVisible) {
            this.currentWidget = this.recentlyVisible;
        }
    }

    registerVariables(variables: VariableRegistry): void {
        this.registerWorkspaceRootVariables(variables);

        variables.registerVariable({
            name: 'file',
            description: 'The path of the currently opened file',
            resolve: () => {
                const uri = this.getResourceUri();
                return uri && this.fileService.fsPath(uri);
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
    }

    protected registerWorkspaceRootVariables(variables: VariableRegistry): void {
        const scoped = (variable: Variable): Variable => ({
            name: variable.name,
            description: variable.description,
            resolve: (context, workspaceRootName) => {
                const workspaceRoot = workspaceRootName && this.workspaceService.tryGetRoots().find(r => r.resource.path.name === workspaceRootName);
                return variable.resolve(workspaceRoot ? workspaceRoot.resource : context);
            }
        });
        variables.registerVariable(scoped({
            name: 'workspaceRoot',
            description: 'The path of the workspace root folder',
            resolve: (context?: URI) => {
                const uri = this.getWorkspaceRootUri(context);
                return uri && this.fileService.fsPath(uri);
            }
        }));
        variables.registerVariable(scoped({
            name: 'workspaceFolder',
            description: 'The path of the workspace root folder',
            resolve: (context?: URI) => {
                const uri = this.getWorkspaceRootUri(context);
                return uri && this.fileService.fsPath(uri);
            }
        }));
        variables.registerVariable(scoped({
            name: 'workspaceRootFolderName',
            description: 'The name of the workspace root folder',
            resolve: (context?: URI) => {
                const uri = this.getWorkspaceRootUri(context);
                return uri && uri.displayName;
            }
        }));
        variables.registerVariable(scoped({
            name: 'workspaceFolderBasename',
            description: 'The name of the workspace root folder',
            resolve: (context?: URI) => {
                const uri = this.getWorkspaceRootUri(context);
                return uri && uri.displayName;
            }
        }));
        variables.registerVariable(scoped({
            name: 'cwd',
            description: "The task runner's current working directory on startup",
            resolve: (context?: URI) => {
                const uri = this.getWorkspaceRootUri(context);
                return (uri && this.fileService.fsPath(uri)) || '';
            }
        }));
        variables.registerVariable(scoped({
            name: 'relativeFile',
            description: "The currently opened file's path relative to the workspace root",
            resolve: (context?: URI) => {
                const uri = this.getResourceUri();
                return uri && this.getWorkspaceRelativePath(uri, context);
            }
        }));
        variables.registerVariable(scoped({
            name: 'relativeFileDirname',
            description: "The current opened file's dirname relative to ${workspaceFolder}",
            resolve: (context?: URI) => {
                const uri = this.getResourceUri();
                const relativePath = uri && this.getWorkspaceRelativePath(uri, context);
                return relativePath && new Path(relativePath).dir.toString();
            }
        }));
    }

    getWorkspaceRootUri(uri: URI | undefined = this.getResourceUri()): URI | undefined {
        return this.workspaceService.getWorkspaceRootUri(uri);
    }

    getResourceUri(): URI | undefined {
        return this.currentWidget && this.currentWidget.getResourceUri();
    }

    getWorkspaceRelativePath(uri: URI, context?: URI): string | undefined {
        const workspaceRootUri = this.getWorkspaceRootUri(context || uri);
        const path = workspaceRootUri && workspaceRootUri.path.relative(uri.path);
        return path && path.toString();
    }

}
