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
import { ApplicationShell, PINNED_CLASS, Saveable, TabBar, Widget } from '@theia/core/lib/browser';
import { MAIN_RPC_CONTEXT, TabDto, TabGroupDto, TabsExt, TabsMain } from '../../../common/plugin-api-rpc';
import { RPCProtocol } from '../../../common/rpc-protocol';
import { EditorPreviewWidget } from '@theia/editor-preview/lib/browser/editor-preview-widget';

export class TabsMainImp implements TabsMain {

    private readonly proxy: TabsExt;
    private tabGroupModel: TabGroupDto[] = [];

    private applicationShell: ApplicationShell;

    constructor(
        rpc: RPCProtocol,
        container: interfaces.Container
    ) {
        this.proxy = rpc.getProxy(MAIN_RPC_CONTEXT.TABS_EXT);
        console.log('TabsMainImp constructor called!');
        console.log(this.proxy);

        this.applicationShell = container.get(ApplicationShell);
        this.applicationShell.mainPanel.onDidChangeCurrent(() => this.createTabsModel());
        this.createTabsModel();
    }

    private createTabsModel(): void {
        const activeWidget = this.applicationShell.activeWidget;
        console.log(activeWidget);
        this.tabGroupModel = this.applicationShell.mainAreaTabBars.map((tabBar: TabBar<Widget>, groupId: number) => {
            let groupIsActive = false;
            const tabs: TabDto[] = tabBar.titles.map(title => {
                const widget = title.owner;
                let isActive = false;
                if (activeWidget?.id === widget.id) {
                    isActive = true;
                    groupIsActive = true;
                }
                return {
                    id: widget.id,
                    label: title.label,
                    input: '',
                    isActive,
                    isPinned: title.className.includes(PINNED_CLASS),
                    isDirty: Saveable.isDirty(widget),
                    isPreview: widget instanceof EditorPreviewWidget && widget.isPreview
                };
            });
            const viewColumn = 1;
            return {
                groupId, tabs, isActive: groupIsActive, viewColumn
            };
        });
        this.proxy.$acceptEditorTabModel(this.tabGroupModel);
    }

    // #region Messages received from Ext Host
    $moveTab(tabId: string, index: number, viewColumn: number, preserveFocus?: boolean): void {
        return;
    }

    async $closeTab(tabIds: string[], preserveFocus?: boolean): Promise<boolean> {
        for (const tabId of tabIds) {
            const widget = this.applicationShell.getWidgetById(tabId);
            if (!widget) {
                continue;
            }
            widget.dispose();
            // TODO if this was an active widget/tab we need to activate another widget in the the parent widget/group
            // after disposing this. If this was the last one the first widget in the first group should be activated.
        }
        return true;
    }

    async $closeGroup(groupIds: number[], preserveFocus?: boolean): Promise<boolean> {
        return false;
    }
    // #endregion
}
