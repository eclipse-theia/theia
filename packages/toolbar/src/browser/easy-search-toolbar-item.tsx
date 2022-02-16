/********************************************************************************
 * Copyright (C) 2022 Ericsson and others.
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

import { Command, CommandContribution, CommandRegistry, MenuContribution, MenuModelRegistry, nls } from '@theia/core';
import { quickCommand } from '@theia/core/lib/browser';
import { inject, injectable, interfaces } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { quickFileOpen } from '@theia/file-search/lib/browser/quick-file-open';
import { SearchInWorkspaceCommands } from '@theia/search-in-workspace/lib/browser/search-in-workspace-frontend-contribution';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { AbstractMainToolbarContribution } from './abstract-main-toolbar-contribution';
import { SearchInWorkspaceQuickInputService } from './search-in-workspace-root-quick-input-service';
import { MainToolbarMenus, ReactInteraction } from './main-toolbar-constants';
import {
    ReactTabBarToolbarContribution,
    ToolbarAlignment,
} from './main-toolbar-interfaces';

export const FIND_IN_WORKSPACE_ROOT = Command.toLocalizedCommand({
    id: 'main.toolbar.find.in.workspace.root',
    category: 'Search',
    label: 'Search Workspace Root for Text',
}, 'theia/toolbar/searchWorkspaceRootForText', nls.getDefaultKey('Search'));

@injectable()
export class EasySearchToolbarItem extends AbstractMainToolbarContribution
    implements CommandContribution,
    MenuContribution {
    @inject(SearchInWorkspaceQuickInputService) protected readonly searchPickService: SearchInWorkspaceQuickInputService;
    @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService;

    id = 'easy-search-toolbar-widget';
    column = ToolbarAlignment.RIGHT;
    priority = 1;

    protected handleOnClick = (e: ReactInteraction<HTMLSpanElement>): void => this.doHandleOnClick(e);
    protected doHandleOnClick(e: ReactInteraction<HTMLSpanElement>): void {
        e.stopPropagation();
        const toolbar = document.querySelector<HTMLDivElement>('#main-toolbar');
        if (toolbar) {
            const { bottom } = toolbar.getBoundingClientRect();
            const { left } = e.currentTarget.getBoundingClientRect();
            this.contextMenuRenderer.render({
                includeAnchorArg: false,
                menuPath: MainToolbarMenus.SEARCH_WIDGET_DROPDOWN_MENU,
                anchor: { x: left, y: bottom },
            });
        }
    }

    render(): React.ReactNode {
        return (
            <div
                role='button'
                tabIndex={0}
                className='icon-wrapper action-item item enabled'
                onClick={this.handleOnClick}
                title={nls.localize('theia/toolbar/search/icon', 'Search for files, text, commands, and more...')}
            >
                <div
                    className='codicon codicon-search'
                    id='easy-search-item-icon'
                    role='button'
                    tabIndex={0}
                    onClick={this.handleOnClick}
                />
                <div className='codicon codicon-triangle-down' />
            </div>);
    }

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(FIND_IN_WORKSPACE_ROOT, {
            execute: async () => {
                const wsRoots = await this.workspaceService.roots;
                if (!wsRoots.length) {
                    await this.commandService.executeCommand(SearchInWorkspaceCommands.FIND_IN_FOLDER.id);
                } else if (wsRoots.length === 1) {
                    const { resource } = wsRoots[0];
                    await this.commandService.executeCommand(SearchInWorkspaceCommands.FIND_IN_FOLDER.id, [resource]);
                } else {
                    this.searchPickService.open();
                }
            },
        });
    }

    registerMenus(registry: MenuModelRegistry): void {
        registry.registerMenuAction(MainToolbarMenus.SEARCH_WIDGET_DROPDOWN_MENU, {
            commandId: quickCommand.id,
            label: nls.localize('theia/toolbar/search/findACommand', 'Find a Command'),
            order: 'a',
        });
        registry.registerMenuAction(MainToolbarMenus.SEARCH_WIDGET_DROPDOWN_MENU, {
            commandId: quickFileOpen.id,
            order: 'b',
            label: nls.localize('theia/toolbar/search/searchForAFile', 'Search for a file')
        });
        registry.registerMenuAction(MainToolbarMenus.SEARCH_WIDGET_DROPDOWN_MENU, {
            commandId: SearchInWorkspaceCommands.OPEN_SIW_WIDGET.id,
            label: nls.localize('theia/toolbar/search/searchWorkspaceForText', 'Search Entire Workspace for Text'),
            order: 'c',
        });
        registry.registerMenuAction(MainToolbarMenus.SEARCH_WIDGET_DROPDOWN_MENU, {
            commandId: FIND_IN_WORKSPACE_ROOT.id,
            order: 'd',
        });
    }
}

export const bindEasySearchToolbarWidget = (bind: interfaces.Bind): void => {
    bind(EasySearchToolbarItem).toSelf().inSingletonScope();
    bind(ReactTabBarToolbarContribution).to(EasySearchToolbarItem);
    bind(CommandContribution).to(EasySearchToolbarItem);
    bind(MenuContribution).to(EasySearchToolbarItem);
};
