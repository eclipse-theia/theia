/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

import { AbstractViewContribution, KeybindingRegistry, LabelProvider, CommonMenus, FrontendApplication, FrontendApplicationContribution } from '@theia/core/lib/browser';
import { SearchInWorkspaceWidget } from './search-in-workspace-widget';
import { injectable, inject, postConstruct } from 'inversify';
import { CommandRegistry, MenuModelRegistry, SelectionService, Command } from '@theia/core';
import { Widget } from '@theia/core/lib/browser/widgets';
import { NavigatorContextMenu } from '@theia/navigator/lib/browser/navigator-contribution';
import { UriCommandHandler, UriAwareCommandHandler } from '@theia/core/lib/common/uri-command-handler';
import URI from '@theia/core/lib/common/uri';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { FileSystem } from '@theia/filesystem/lib/common';
import { SearchInWorkspaceContextKeyService } from './search-in-workspace-context-key-service';
import { TabBarToolbarContribution, TabBarToolbarRegistry } from '@theia/core/lib/browser/shell/tab-bar-toolbar';

export namespace SearchInWorkspaceCommands {
    const SEARCH_CATEGORY = 'Search';
    export const TOGGLE_SIW_WIDGET = {
        id: 'search-in-workspace.toggle'
    };
    export const OPEN_SIW_WIDGET: Command = {
        id: 'search-in-workspace.open',
        category: SEARCH_CATEGORY,
        label: 'Find in Files'

    };
    export const FIND_IN_FOLDER: Command = {
        id: 'search-in-workspace.in-folder',
        category: SEARCH_CATEGORY,
        label: 'Find in Folder'
    };
    export const REFRESH_RESULTS: Command = {
        id: 'search-in-workspace.refresh',
        category: SEARCH_CATEGORY,
        label: 'Refresh',
        iconClass: 'refresh'
    };
    export const COLLAPSE_ALL: Command = {
        id: 'search-in-workspace.collapse-all',
        category: SEARCH_CATEGORY,
        label: 'Collapse All',
        iconClass: 'collapse-all'
    };
    export const CLEAR_ALL: Command = {
        id: 'search-in-workspace.clear-all',
        category: SEARCH_CATEGORY,
        label: 'Clear All',
        iconClass: 'clear-all'
    };
}

@injectable()
export class SearchInWorkspaceFrontendContribution extends AbstractViewContribution<SearchInWorkspaceWidget> implements FrontendApplicationContribution, TabBarToolbarContribution {

    @inject(SelectionService) protected readonly selectionService: SelectionService;
    @inject(LabelProvider) protected readonly labelProvider: LabelProvider;
    @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService;
    @inject(FileSystem) protected readonly fileSystem: FileSystem;

    @inject(SearchInWorkspaceContextKeyService)
    protected readonly contextKeyService: SearchInWorkspaceContextKeyService;

    constructor() {
        super({
            widgetId: SearchInWorkspaceWidget.ID,
            widgetName: SearchInWorkspaceWidget.LABEL,
            defaultWidgetOptions: {
                area: 'left',
                rank: 300
            },
            toggleCommandId: SearchInWorkspaceCommands.TOGGLE_SIW_WIDGET.id
        });
    }

    @postConstruct()
    protected init(): void {
        const updateFocusContextKey = () =>
            this.contextKeyService.searchViewletFocus.set(this.shell.activeWidget instanceof SearchInWorkspaceWidget);
        updateFocusContextKey();
        this.shell.activeChanged.connect(updateFocusContextKey);
    }

    async initializeLayout(app: FrontendApplication): Promise<void> {
        await this.openView({ activate: false });
    }

    async registerCommands(commands: CommandRegistry): Promise<void> {
        super.registerCommands(commands);
        commands.registerCommand(SearchInWorkspaceCommands.OPEN_SIW_WIDGET, {
            isEnabled: () => this.workspaceService.tryGetRoots().length > 0,
            execute: () => this.openView({
                activate: true
            })
        });

        commands.registerCommand(SearchInWorkspaceCommands.FIND_IN_FOLDER, this.newMultiUriAwareCommandHandler({
            execute: async uris => {
                const resources: string[] = [];
                await Promise.all(uris.map(uri =>
                    this.fileSystem.getFileStat(uri.toString())
                )).then(stats => {
                    for (const stat of stats) {
                        if (stat) {
                            const uri = new URI(stat.uri);
                            let uriStr = this.labelProvider.getLongName(uri);
                            if (stat && !stat.isDirectory) {
                                uriStr = this.labelProvider.getLongName(uri.parent);
                            }
                            resources.push(uriStr);
                        }
                    }
                });
                const widget = await this.openView({ activate: true });
                widget.findInFolder(resources);
            }
        }));

        commands.registerCommand(SearchInWorkspaceCommands.REFRESH_RESULTS, {
            execute: w => this.withWidget(w, widget => widget.refresh()),
            isEnabled: w => this.withWidget(w, widget => (widget.hasResultList() || widget.hasSearchTerm()) && this.workspaceService.tryGetRoots().length > 0),
            isVisible: w => this.withWidget(w, () => true)
        });
        commands.registerCommand(SearchInWorkspaceCommands.COLLAPSE_ALL, {
            execute: w => this.withWidget(w, widget => widget.collapseAll()),
            isEnabled: w => this.withWidget(w, widget => widget.hasResultList()),
            isVisible: w => this.withWidget(w, () => true)
        });
        commands.registerCommand(SearchInWorkspaceCommands.CLEAR_ALL, {
            execute: w => this.withWidget(w, widget => widget.clear()),
            isEnabled: w => this.withWidget(w, widget => widget.hasResultList()),
            isVisible: w => this.withWidget(w, () => true)
        });
    }

    protected withWidget<T>(widget: Widget | undefined = this.tryGetWidget(), fn: (widget: SearchInWorkspaceWidget) => T): T | false {
        if (widget instanceof SearchInWorkspaceWidget && widget.id === SearchInWorkspaceWidget.ID) {
            return fn(widget);
        }
        return false;
    }

    registerKeybindings(keybindings: KeybindingRegistry): void {
        super.registerKeybindings(keybindings);
        keybindings.registerKeybinding({
            command: SearchInWorkspaceCommands.OPEN_SIW_WIDGET.id,
            keybinding: 'ctrlcmd+shift+f'
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        super.registerMenus(menus);
        menus.registerMenuAction(NavigatorContextMenu.SEARCH, {
            commandId: SearchInWorkspaceCommands.FIND_IN_FOLDER.id
        });
        menus.registerMenuAction(CommonMenus.EDIT_FIND, {
            commandId: SearchInWorkspaceCommands.OPEN_SIW_WIDGET.id
        });
    }

    async registerToolbarItems(toolbarRegistry: TabBarToolbarRegistry): Promise<void> {
        const widget = await this.widget;
        const onDidChange = widget.onDidUpdate;
        toolbarRegistry.registerItem({
            id: SearchInWorkspaceCommands.REFRESH_RESULTS.id,
            command: SearchInWorkspaceCommands.REFRESH_RESULTS.id,
            priority: 0,
            onDidChange
        });
        toolbarRegistry.registerItem({
            id: SearchInWorkspaceCommands.CLEAR_ALL.id,
            command: SearchInWorkspaceCommands.CLEAR_ALL.id,
            priority: 1,
            onDidChange
        });
        toolbarRegistry.registerItem({
            id: SearchInWorkspaceCommands.COLLAPSE_ALL.id,
            command: SearchInWorkspaceCommands.COLLAPSE_ALL.id,
            priority: 2,
            onDidChange
        });
    }

    protected newUriAwareCommandHandler(handler: UriCommandHandler<URI>): UriAwareCommandHandler<URI> {
        return new UriAwareCommandHandler(this.selectionService, handler);
    }

    protected newMultiUriAwareCommandHandler(handler: UriCommandHandler<URI[]>): UriAwareCommandHandler<URI[]> {
        return new UriAwareCommandHandler(this.selectionService, handler, { multi: true });
    }
}
