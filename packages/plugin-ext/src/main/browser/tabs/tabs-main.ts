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
import { ApplicationShell, PINNED_CLASS, Saveable, ScrollableTabBar, TabBar, Title, ViewContainer, Widget } from '@theia/core/lib/browser';
import { AnyInputDto, MAIN_RPC_CONTEXT, TabDto, TabGroupDto, TabInputKind, TabModelOperationKind, TabsExt, TabsMain } from '../../../common/plugin-api-rpc';
import { RPCProtocol } from '../../../common/rpc-protocol';
import { EditorPreviewWidget } from '@theia/editor-preview/lib/browser/editor-preview-widget';
import { Disposable } from '@theia/core/shared/vscode-languageserver-protocol';
import { MonacoDiffEditor } from '@theia/monaco/lib/browser/monaco-diff-editor';
import { toUriComponents } from '../hierarchy/hierarchy-types-converters';
import { TerminalWidget } from '@theia/terminal/lib/browser/base/terminal-widget';

export class TabsMainImp implements TabsMain, Disposable {

    private readonly proxy: TabsExt;
    private tabGroupModel: TabGroupDto[] = [];

    private applicationShell: ApplicationShell;

    private toDispose: Disposable[] = [];

    constructor(
        rpc: RPCProtocol,
        container: interfaces.Container
    ) {
        this.proxy = rpc.getProxy(MAIN_RPC_CONTEXT.TABS_EXT);

        this.applicationShell = container.get(ApplicationShell);
        this.createTabsModel();

        const tabBars = this.applicationShell.mainPanel.tabBars();
        for (let tabBar; tabBar = tabBars.next();) {
            this.attachListenersToTabBar(tabBar);
        }

        this.toDispose.push(
            this.applicationShell.mainPanelRenderer.onTabBarCreated(tabBar => {
                this.attachListenersToTabBar(tabBar);
                this.onTabGroupCreated(tabBar);
            })
        );
    }

    protected createTabsModel(): void {
        this.tabGroupModel = this.applicationShell.mainAreaTabBars.map(this.createTabGroupDto, this);
        this.proxy.$acceptEditorTabModel(this.tabGroupModel);
    }

    protected createTabDto(tabTitle: Title<Widget>): TabDto {
        const activeWidget = this.applicationShell.activeWidget;
        const widget = tabTitle.owner;
        let isActive = false;
        if (activeWidget?.id === widget.id) {
            isActive = true;
        }
        return {
            id: widget.id,
            label: tabTitle.label,
            input: this.evaluateTabDtoInput(widget),
            isActive,
            isPinned: tabTitle.className.includes(PINNED_CLASS),
            isDirty: Saveable.isDirty(widget),
            isPreview: widget instanceof EditorPreviewWidget && widget.isPreview
        };
    }

    protected createTabGroupDto(tabBar: TabBar<Widget>, groupId: number): TabGroupDto {
        let groupIsActive = false;
        const tabs: TabDto[] = tabBar.titles.map(title => {
            const tabDto = this.createTabDto(title);
            if (tabDto.isActive) {
                groupIsActive = true;
            }
            return tabDto;
            });
            const viewColumn = 1;
            return {
                groupId, tabs, isActive: groupIsActive, viewColumn
            };
    }

    protected attachListenersToTabBar(tabBar: TabBar<Widget> | undefined): void {
        if (!tabBar) {
            return;
        }
        tabBar.titles.forEach((title, index) => {
            this.connectToSignal(title.changed, () => this.onTabTitleChanged(title, { title, index }, tabBar));
        });

        this.connectToSignal((tabBar as ScrollableTabBar)?.tabCreated, this.onTabCreated);
        this.connectToSignal(tabBar.tabActivateRequested, this.onTabActivated);
        this.connectToSignal(tabBar.tabCloseRequested, this.onTabClosed);
        this.connectToSignal(tabBar.tabMoved, this.onTabMoved);
        this.connectToSignal(tabBar.disposed, this.onTabGroupClosed);
    }

    protected evaluateTabDtoInput(widget: Widget): AnyInputDto {
        if (widget instanceof EditorPreviewWidget) {
            if (widget.editor instanceof MonacoDiffEditor) {
                return {
                    kind: TabInputKind.TextDiffInput,
                    original: toUriComponents(widget.editor.originalModel.uri),
                    modified: toUriComponents(widget.editor.modifiedModel.uri)
                };
            } else {
                return {
                    kind: TabInputKind.TextInput,
                    uri: toUriComponents(widget.editor.uri.toString())
                };
            }
            // TODO notebook support when implemented
        } else if (widget instanceof ViewContainer) {
            return {
                kind: TabInputKind.WebviewEditorInput,
                viewType: widget.id
            };
        } else if (widget instanceof TerminalWidget) {
            return {
                kind: TabInputKind.TerminalEditorInput
            };
        }

        return { kind: TabInputKind.UnknownInput };
    }

    protected connectToSignal<T>(signal: { connect(listener: T, context: unknown): void, disconnect(listener: T): void }, listener: T): void {
        signal.connect(listener, this);
        this.toDispose.push(Disposable.create(() => signal.disconnect(listener)));
    }

    protected updateActiveGroup(): void {
        const activeWidgetId = this.applicationShell.activeWidget?.id;
        if (activeWidgetId) {
            for (const tabGroup of this.tabGroupModel) {
                for (const tab of tabGroup.tabs) {
                    tab.isActive = activeWidgetId === tab.id;
                    tabGroup.isActive = activeWidgetId === tab.id;
                }
            }
        }
    }

    // #region event listeners
    private onTabCreated(tabBar: TabBar<Widget>, args: TabBar.ITabActivateRequestedArgs<Widget>): void {
        console.log('onTabCreated');
        const groupId = this.applicationShell.mainAreaTabBars.indexOf(tabBar);
        this.connectToSignal(args.title.changed, title => this.onTabTitleChanged(title, args, tabBar));
        this.tabGroupModel[groupId].tabs.splice(args.index, 0, this.createTabDto(args.title));
        this.proxy.$acceptTabOperation({
            kind: TabModelOperationKind.TAB_OPEN,
            index: args.index,
            tabDto: this.createTabDto(args.title),
            groupId
        });
    }

    private onTabTitleChanged(title: Title<Widget>, args: TabBar.ITabActivateRequestedArgs<Widget>, tabBar: TabBar<Widget>): void {
        const groupId = this.applicationShell.mainAreaTabBars.indexOf(tabBar);
        const oldTabDto = this.tabGroupModel[groupId].tabs[args.index];
        const newTabDto = this.createTabDto(title);
        if (oldTabDto !== newTabDto) {
            console.log('onTabTitleChanged');
            this.tabGroupModel[groupId].tabs.splice(args.index, 1, newTabDto);
            this.proxy.$acceptTabOperation({
                kind: TabModelOperationKind.TAB_UPDATE,
                index: args.index,
                tabDto: newTabDto,
                groupId
            });
        }
    }

    private onTabActivated(tabBar: TabBar<Widget>, args: TabBar.ITabActivateRequestedArgs<Widget>): void {
        console.log('onTabActivated');
        const groupId = this.applicationShell.mainAreaTabBars.indexOf(tabBar);
        const tabDto = this.createTabDto(args.title);
        this.tabGroupModel[groupId].tabs.splice(args.index, 1, tabDto);
        this.proxy.$acceptTabOperation({
            kind: TabModelOperationKind.TAB_UPDATE,
            index: args.index,
            tabDto: tabDto,
            groupId
        });
    }

    private onTabClosed(tabBar: TabBar<Widget>, args: TabBar.ITabCloseRequestedArgs<Widget>): void {
        console.log('onTabClosed');
        const groupId = this.applicationShell.mainAreaTabBars.indexOf(tabBar);
        this.tabGroupModel[groupId].tabs.splice(args.index, 1);
        this.proxy.$acceptTabOperation({
            kind: TabModelOperationKind.TAB_CLOSE,
            index: args.index,
            tabDto: this.createTabDto(args.title),
            groupId
        });
    }

    private onTabMoved(tabBar: TabBar<Widget>, args: TabBar.ITabMovedArgs<Widget>): void {
        console.log('onTabMoved');
        const groupId = this.applicationShell.mainAreaTabBars.indexOf(tabBar);
        this.tabGroupModel[groupId].tabs.splice(args.fromIndex, 1);
        this.tabGroupModel[groupId].tabs.splice(args.toIndex, 1, this.createTabDto(args.title));
        this.proxy.$acceptTabOperation({
            kind: TabModelOperationKind.TAB_MOVE,
            index: args.toIndex,
            tabDto: this.createTabDto(args.title),
            groupId,
            oldIndex: args.fromIndex
        });
    }

    private onTabGroupCreated(tabBar: TabBar<Widget>): void {
        console.log('update groups');
        this.tabGroupModel.push(this.createTabGroupDto(tabBar, this.tabGroupModel.length));
        this.updateActiveGroup();
        this.proxy.$acceptEditorTabModel(this.tabGroupModel);
    }

    private onTabGroupClosed(tabBar: TabBar<Widget>): void {
        console.log('update groups');
        this.tabGroupModel.splice(this.applicationShell.mainAreaTabBars.indexOf(tabBar), 1);
        this.updateActiveGroup();
        this.proxy.$acceptEditorTabModel(this.tabGroupModel);
    }
    // #endregion

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
        for (const groupId of groupIds) {
            const group = this.tabGroupModel.find(tabGroup => tabGroup.groupId === groupId);
            if (group) {
                this.$closeTab(group.tabs.map(tab => tab.id), true);
            }
        }
        return true;
    }
    // #endregion

    dispose(): void {
        this.toDispose.forEach(disposable => disposable.dispose());
    }
}
