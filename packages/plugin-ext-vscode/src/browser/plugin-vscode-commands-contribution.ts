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

import { Command, CommandContribution, CommandRegistry, ResourceProvider } from '@theia/core';
import { ApplicationShell, NavigatableWidget, open, OpenerService, Saveable } from '@theia/core/lib/browser';
import { ContextKeyService } from '@theia/core/lib/browser/context-key-service';
import { ApplicationShellMouseTracker } from '@theia/core/lib/browser/shell/application-shell-mouse-tracker';
import { CommandService } from '@theia/core/lib/common/command';
import TheiaURI from '@theia/core/lib/common/uri';
import { EditorManager } from '@theia/editor/lib/browser';
import { TextDocumentShowOptions } from '@theia/plugin-ext/lib/common/plugin-api-rpc-model';
import { DocumentsMainImpl } from '@theia/plugin-ext/lib/main/browser/documents-main';
import { createUntitledResource } from '@theia/plugin-ext/lib/main/browser/editor/untitled-resource';
import { fromViewColumn, toDocumentSymbol } from '@theia/plugin-ext/lib/plugin/type-converters';
import { ViewColumn } from '@theia/plugin-ext/lib/plugin/types-impl';
import { WorkspaceCommands } from '@theia/workspace/lib/browser';
import { DiffService } from '@theia/workspace/lib/browser/diff-service';
import { inject, injectable } from 'inversify';
import URI from 'vscode-uri';

export namespace VscodeCommands {
    export const OPEN: Command = {
        id: 'vscode.open'
    };

    export const DIFF: Command = {
        id: 'vscode.diff'
    };

    export const SET_CONTEXT: Command = {
        id: 'setContext'
    };
}

@injectable()
export class PluginVscodeCommandsContribution implements CommandContribution {
    @inject(CommandService)
    protected readonly commandService: CommandService;
    @inject(ContextKeyService)
    protected readonly contextKeyService: ContextKeyService;
    @inject(EditorManager)
    protected readonly editorManager: EditorManager;
    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;
    @inject(ResourceProvider)
    protected readonly resources: ResourceProvider;
    @inject(DiffService)
    protected readonly diffService: DiffService;
    @inject(OpenerService)
    protected readonly openerService: OpenerService;
    @inject(ApplicationShellMouseTracker)
    protected readonly mouseTracker: ApplicationShellMouseTracker;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(VscodeCommands.OPEN, {
            isVisible: () => false,
            execute: async (resource: URI, columnOrOptions?: ViewColumn | TextDocumentShowOptions) => {
                if (!resource) {
                    throw new Error(`${VscodeCommands.OPEN.id} command requires at least URI argument.`);
                }
                if (!URI.isUri(resource)) {
                    throw new Error(`Invalid argument for ${VscodeCommands.OPEN.id} command with URI argument. Found ${resource}`);
                }

                let options: TextDocumentShowOptions | undefined;
                if (typeof columnOrOptions === 'number') {
                    options = {
                        viewColumn: fromViewColumn(columnOrOptions)
                    };
                } else if (columnOrOptions) {
                    options = {
                        ...columnOrOptions,
                        viewColumn: fromViewColumn(columnOrOptions.viewColumn)
                    };
                }
                const editorOptions = DocumentsMainImpl.toEditorOpenerOptions(this.shell, options);
                await open(this.openerService, new TheiaURI(resource), editorOptions);
            }
        });

        commands.registerCommand(VscodeCommands.DIFF, {
            isVisible: () => false,
            // tslint:disable-next-line: no-any
            execute: async (left: URI, right: URI, label?: string, options?: TextDocumentShowOptions) => {
                if (!left || !right) {
                    throw new Error(`${VscodeCommands.DIFF} command requires at least two URI arguments. Found left=${left}, right=${right} as arguments`);
                }
                if (!URI.isUri(left)) {
                    throw new Error(`Invalid argument for ${VscodeCommands.DIFF.id} command with left argument. Expecting URI left type but found ${left}`);
                }
                if (!URI.isUri(right)) {
                    throw new Error(`Invalid argument for ${VscodeCommands.DIFF.id} command with right argument. Expecting URI right type but found ${right}`);
                }

                const leftURI = new TheiaURI(left);
                const editorOptions = DocumentsMainImpl.toEditorOpenerOptions(this.shell, options);
                await this.diffService.openDiffEditor(leftURI, new TheiaURI(right), label, editorOptions);
            }
        });

        commands.registerCommand(VscodeCommands.SET_CONTEXT, {
            isVisible: () => false,
            // tslint:disable-next-line: no-any
            execute: (contextKey: any, contextValue: any) => {
                this.contextKeyService.createKey(String(contextKey), contextValue);
            }
        });

        // https://code.visualstudio.com/docs/getstarted/keybindings#_navigation
        /*
         * internally, in VS Code, any widget opened in the main area is represented as an editor
         * operations below apply to them, but not to side-bar widgets, like the explorer
         *
         * in Theia, there are not such difference and any widget can be put in any area
         * because of it we filter out editors from views based on `NavigatableWidget.is`
         * and apply actions only to them
         */
        commands.registerCommand({ id: 'workbench.action.files.newUntitledFile' }, {
            execute: () => open(this.openerService, createUntitledResource().uri)
        });
        commands.registerCommand({ id: 'workbench.action.files.openFile' }, {
            execute: () => commands.executeCommand(WorkspaceCommands.OPEN_FILE.id)
        });
        commands.registerCommand({ id: 'workbench.action.files.openFolder' }, {
            execute: () => commands.executeCommand(WorkspaceCommands.OPEN_FOLDER.id)
        });
        commands.registerCommand({ id: 'workbench.action.files.save', }, {
            execute: (uri?: monaco.Uri) => {
                if (uri) {
                    const uriString = uri.toString();
                    const widget = this.shell.widgets.find(w => {
                        const resourceUri = Saveable.is(w) && NavigatableWidget.is(w) && w.getResourceUri();
                        return (resourceUri && resourceUri.toString()) === uriString;
                    });
                    if (Saveable.is(widget)) {
                        Saveable.save(widget);
                    }
                } else {
                    this.shell.save();
                }
            }
        });
        commands.registerCommand({ id: 'workbench.action.files.saveAll', }, {
            execute: () => this.shell.saveAll()
        });
        commands.registerCommand({ id: 'workbench.action.closeActiveEditor' }, {
            execute: (uri?: monaco.Uri) => {
                let widget = this.editorManager.currentEditor || this.shell.currentWidget;
                if (uri) {
                    const uriString = uri.toString();
                    widget = this.shell.widgets.find(w => {
                        const resourceUri = NavigatableWidget.is(w) && w.getResourceUri();
                        return (resourceUri && resourceUri.toString()) === uriString;
                    });
                }
                if (NavigatableWidget.is(widget)) {
                    widget.close();
                }
            }
        });
        commands.registerCommand({ id: 'workbench.action.closeOtherEditors' }, {
            execute: (uri?: monaco.Uri) => {
                let editor = this.editorManager.currentEditor || this.shell.currentWidget;
                if (uri) {
                    const uriString = uri.toString();
                    editor = this.editorManager.all.find(e => {
                        const resourceUri = e.getResourceUri();
                        return (resourceUri && resourceUri.toString()) === uriString;
                    });
                }
                for (const widget of this.shell.widgets) {
                    if (NavigatableWidget.is(widget) && widget !== editor) {
                        widget.close();
                    }
                }
            }
        });
        commands.registerCommand({ id: 'workbench.action.closeEditorsInGroup' }, {
            execute: (uri?: monaco.Uri) => {
                let editor = this.editorManager.currentEditor || this.shell.currentWidget;
                if (uri) {
                    const uriString = uri.toString();
                    editor = this.editorManager.all.find(e => {
                        const resourceUri = e.getResourceUri();
                        return (resourceUri && resourceUri.toString()) === uriString;
                    });
                }
                if (editor) {
                    const tabBar = this.shell.getTabBarFor(editor);
                    if (tabBar) {
                        this.shell.closeTabs(tabBar,
                            ({ owner }) => NavigatableWidget.is(owner) && owner !== editor
                        );
                    }
                }
            }
        });
        commands.registerCommand({ id: 'workbench.action.closeEditorsInOtherGroups' }, {
            execute: () => {
                const editor = this.editorManager.currentEditor || this.shell.currentWidget;
                if (editor) {
                    const editorTabBar = this.shell.getTabBarFor(editor);
                    for (const tabBar of this.shell.allTabBars) {
                        if (tabBar !== editorTabBar) {
                            this.shell.closeTabs(tabBar,
                                ({ owner }) => NavigatableWidget.is(owner)
                            );
                        }
                    }
                }
            }
        });
        commands.registerCommand({ id: 'workbench.action.closeEditorsToTheLeft' }, {
            execute: () => {
                const editor = this.editorManager.currentEditor || this.shell.currentWidget;
                if (editor) {
                    const tabBar = this.shell.getTabBarFor(editor);
                    if (tabBar) {
                        let left = true;
                        this.shell.closeTabs(tabBar,
                            ({ owner }) => {
                                if (owner === editor) {
                                    left = false;
                                    return false;
                                }
                                return left && NavigatableWidget.is(owner);
                            }
                        );
                    }
                }
            }
        });
        commands.registerCommand({ id: 'workbench.action.closeEditorsToTheRight' }, {
            execute: () => {
                const editor = this.editorManager.currentEditor || this.shell.currentWidget;
                if (editor) {
                    const tabBar = this.shell.getTabBarFor(editor);
                    if (tabBar) {
                        let left = true;
                        this.shell.closeTabs(tabBar,
                            ({ owner }) => {
                                if (owner === editor) {
                                    left = false;
                                    return false;
                                }
                                return !left && NavigatableWidget.is(owner);
                            }
                        );
                    }
                }
            }
        });
        commands.registerCommand({ id: 'workbench.action.closeAllEditors' }, {
            execute: () => {
                for (const widget of this.shell.widgets) {
                    if (NavigatableWidget.is(widget)) {
                        widget.close();
                    }
                }
            }
        });

        commands.registerCommand({ id: 'workbench.action.reloadWindow' }, {
            execute: () => {
                window.location.reload();
            }
        });

        /**
         * TODO:
         * Keep Open	workbench.action.keepEditor
         * Open Next	workbench.action.openNextRecentlyUsedEditorInGroup
         * Open Previous	workbench.action.openPreviousRecentlyUsedEditorInGroup
         * Copy Path of Active File	workbench.action.files.copyPathOfActiveFile
         * Reveal Active File in Windows	workbench.action.files.revealActiveFileInWindows
         * Show Opened File in New Window	workbench.action.files.showOpenedFileInNewWindow
         * Compare Opened File With	workbench.files.action.compareFileWith
         */

        // Register built-in language service commands
        // see https://code.visualstudio.com/api/references/commands
        // tslint:disable: no-any
        commands.registerCommand(
            {
                id: 'vscode.executeDocumentSymbolProvider'
            },
            {
                execute: (resource: URI) => commands.executeCommand('_executeDocumentSymbolProvider',
                    { resource: monaco.Uri.parse(resource.toString()) }
                ).then((value: any) => {
                    if (!Array.isArray(value) || value === undefined) {
                        return undefined;
                    }
                    return value.map(loc => toDocumentSymbol(loc));
                })
            }
        );
        // TODO register other `vscode.execute...` commands.
        // see https://github.com/microsoft/vscode/blob/master/src/vs/workbench/api/common/extHostApiCommands.ts
    }

}
