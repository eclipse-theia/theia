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

import { injectable, inject } from 'inversify';
import { CommandContribution, CommandRegistry, Command } from '@theia/core';
import { CommandService } from '@theia/core/lib/common/command';
import TheiaURI from '@theia/core/lib/common/uri';
import URI from 'vscode-uri';
import { ContextKeyService } from '@theia/core/lib/browser/context-key-service';
import { DiffService } from '@theia/workspace/lib/browser/diff-service';
import { EditorManager } from '@theia/editor/lib/browser';
import { WebviewWidget } from '@theia/plugin-ext/lib/main/browser/webview/webview';
import { ApplicationShell, NavigatableWidget, OpenerService, open, Saveable } from '@theia/core/lib/browser';
import { ResourceProvider } from '@theia/core';
import { ViewColumn } from '@theia/plugin-ext/lib/plugin/types-impl';
import { TextDocumentShowOptions } from '@theia/plugin-ext/lib/api/model';
import { fromViewColumn } from '@theia/plugin-ext/lib/plugin/type-converters';
import { WorkspaceCommands } from '@theia/workspace/lib/browser';
import { createUntitledResource } from '@theia/plugin-ext/lib/main/browser/editor/untitled-resource';

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

    export const PREVIEW_HTML: Command = {
        id: 'vscode.previewHtml'
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

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(VscodeCommands.OPEN, {
            isVisible: () => false,
            execute: (resource: URI, columnOrOptions?: ViewColumn | TextDocumentShowOptions) => {
                if (!resource) {
                    throw new Error(`${VscodeCommands.OPEN.id} command requires at least URI argument.`);
                }
                if (!URI.isUri(resource)) {
                    throw new Error(`Invalid argument for ${VscodeCommands.OPEN.id} command with URI argument. Found ${resource}`);
                }

                let position: number | undefined;
                if (columnOrOptions) {
                    if (typeof columnOrOptions === 'number') {
                        position = fromViewColumn(columnOrOptions);
                    } else if (columnOrOptions.viewColumn) {
                        position = fromViewColumn(columnOrOptions.viewColumn);
                    } else {
                        throw new Error(`Invalid argument for ${VscodeCommands.OPEN.id} command with columnOrOptions argument. Found ${columnOrOptions}`);
                    }
                }

                this.commandService.executeCommand('theia.open', new TheiaURI(resource), position);
            }
        });

        commands.registerCommand(VscodeCommands.DIFF, {
            isVisible: () => false,
            // tslint:disable-next-line: no-any
            execute: async (left: URI, right: URI, label?: string) => {
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
                await this.diffService.openDiffEditor(leftURI, new TheiaURI(right), label);
            }
        });

        commands.registerCommand(VscodeCommands.SET_CONTEXT, {
            isVisible: () => false,
            // tslint:disable-next-line: no-any
            execute: (contextKey: any, contextValue: any) => {
                this.contextKeyService.createKey(String(contextKey), contextValue);
            }
        });
        commands.registerCommand(VscodeCommands.PREVIEW_HTML, {
            isVisible: () => false,
            // tslint:disable-next-line: no-any
            execute: async (resource: URI, position?: any, label?: string, options?: any) => {
                label = label || resource.fsPath;
                const view = new WebviewWidget(label, { allowScripts: true }, {});
                const res = await this.resources(new TheiaURI(resource));
                const str = await res.readContents();
                const html = this.getHtml(str);
                this.shell.addWidget(view, { area: 'main', mode: 'split-right' });
                this.shell.activateWidget(view.id);
                view.setHTML(html);

                const editorWidget = await this.editorManager.getOrCreateByUri(new TheiaURI(resource));
                editorWidget.editor.onDocumentContentChanged(listener => {
                    view.setHTML(this.getHtml(editorWidget.editor.document.getText()));
                });

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
    }

    private getHtml(body: String) {
        return `<!DOCTYPE html><html><head></head>${body}</html>`;
    }

}
