// *****************************************************************************
// Copyright (C) 2022 TypeFox and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { interfaces } from '@theia/core/shared/inversify';
import { ApplicationShell, TabBar, Widget } from '@theia/core/lib/browser';
import { MAIN_RPC_CONTEXT, TabDto, TabGroupDto, TabsExt, TabsMain } from '../../../common/plugin-api-rpc';
import { RPCProtocol } from '../../../common/rpc-protocol';

export class TabsMainImp implements TabsMain {

    private readonly proxy: TabsExt;
    private tabGroupModel: TabGroupDto[] = [];
    private tabBars: Map<number, TabBar<Widget>> = new Map();

    private applicationShell: ApplicationShell;

    constructor(
        rpc: RPCProtocol,
        container: interfaces.Container
    ) {
        this.proxy = rpc.getProxy(MAIN_RPC_CONTEXT.TABS_EXT);
        this.applicationShell = container.get(ApplicationShell);
        this.applicationShell.onDidChangeActiveWidget(() => this.createTabsModel());
        this.createTabsModel();
    }

    private createTabsModel(): void {
        const activeWidget = this.applicationShell.activeWidget;
        this.tabGroupModel = this.applicationShell.mainAreaTabBars.map((tabBar: TabBar<Widget>, groupId: number) => {
            let tabBarIsActive = false;
            const tabs: TabDto[] = tabBar.titles.map((title, titleIndex) => {
                const titleIsActive = title.owner === activeWidget;
                if (titleIsActive) {
                    tabBarIsActive = true;
                }
                return {
                    id: title.owner.id,
                    input: '',
                    isActive: titleIsActive,
                    isDirty: false,
                    isPinned: false,
                    isPreview: false,
                    label: title.label
                };
            });
            this.tabBars.set(groupId, tabBar);
            const viewColumn = 1;
            return {
                groupId, tabs, isActive: tabBarIsActive, viewColumn
            };
        });
        this.proxy.$acceptEditorTabModel(this.tabGroupModel);
    }

    // #region Messages received from Ext Host
    $moveTab(tabId: string, index: number, viewColumn: number, preserveFocus?: boolean): void {
        return;
    }

    async $closeTab(tabIds: string[], preserveFocus?: boolean): Promise<boolean> {
        const widgets: Widget[] = [];
        for (const tabId of tabIds) {
            const widget = this.applicationShell.getWidgetById(tabId);
            if (widget) {
                widgets.push(widget);
            }
        }
        await this.applicationShell.closeMany(widgets);
        return true;
    }

    async $closeGroup(groupIds: number[], preserveFocus?: boolean): Promise<boolean> {
        for (const groupId of groupIds) {
            const tabBar = this.tabBars.get(groupId);
            if (tabBar) {
                await this.applicationShell.closeTabs(tabBar);
            }
        }
        return true;
    }
    // #endregion
}
