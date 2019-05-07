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
import { CommandRegistry, CommandContribution } from '@theia/core/lib/common';
import { HostedPluginManagerClient, HostedPluginCommands } from '../../hosted/browser/hosted-plugin-manager-client';
import { PluginExtDeployCommandService } from './plugin-ext-deploy-command';
import { OpenUriCommandHandler } from './commands';
import URI from '@theia/core/lib/common/uri';
import { ApplicationShell, NavigatableWidget, OpenerService, open, Saveable } from '@theia/core/lib/browser';
import { createUntitledResource } from './editor/untitled-resource';
import { WorkspaceCommands } from '@theia/workspace/lib/browser';
import { EditorManager } from '@theia/editor/lib/browser';

@injectable()
export class PluginApiFrontendContribution implements CommandContribution {

    @inject(HostedPluginManagerClient)
    protected readonly hostedPluginManagerClient: HostedPluginManagerClient;

    @inject(PluginExtDeployCommandService)
    protected readonly pluginExtDeployCommandService: PluginExtDeployCommandService;

    @inject(OpenUriCommandHandler)
    protected readonly openUriCommandHandler: OpenUriCommandHandler;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(EditorManager)
    protected readonly editors: EditorManager;

    @inject(OpenerService)
    protected readonly openerService: OpenerService;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(HostedPluginCommands.START, {
            execute: () => this.hostedPluginManagerClient.start()
        });
        commands.registerCommand(HostedPluginCommands.DEBUG, {
            execute: () => this.hostedPluginManagerClient.debug()
        });
        commands.registerCommand(HostedPluginCommands.STOP, {
            execute: () => this.hostedPluginManagerClient.stop()
        });
        commands.registerCommand(HostedPluginCommands.RESTART, {
            execute: () => this.hostedPluginManagerClient.restart()
        });
        commands.registerCommand(HostedPluginCommands.SELECT_PATH, {
            execute: () => this.hostedPluginManagerClient.selectPluginPath()
        });

        commands.registerCommand(PluginExtDeployCommandService.COMMAND, {
            execute: () => this.pluginExtDeployCommandService.deploy()
        });

        commands.registerCommand(OpenUriCommandHandler.COMMAND_METADATA, {
            execute: (arg: URI) => this.openUriCommandHandler.execute(arg),
            isVisible: () => false
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
                let widget = this.editors.currentEditor || this.shell.currentWidget;
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
                let editor = this.editors.currentEditor || this.shell.currentWidget;
                if (uri) {
                    const uriString = uri.toString();
                    editor = this.editors.all.find(e => {
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
                let editor = this.editors.currentEditor || this.shell.currentWidget;
                if (uri) {
                    const uriString = uri.toString();
                    editor = this.editors.all.find(e => {
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
                const editor = this.editors.currentEditor || this.shell.currentWidget;
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
                const editor = this.editors.currentEditor || this.shell.currentWidget;
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
                const editor = this.editors.currentEditor || this.shell.currentWidget;
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

}
