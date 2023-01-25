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
import { ApplicationShell, PINNED_CLASS, Saveable, TabBar, Title, ViewContainer, Widget } from '@theia/core/lib/browser';
import { AnyInputDto, MAIN_RPC_CONTEXT, TabDto, TabGroupDto, TabInputKind, TabModelOperationKind, TabsExt, TabsMain } from '../../../common/plugin-api-rpc';
import { RPCProtocol } from '../../../common/rpc-protocol';
import { EditorPreviewWidget } from '@theia/editor-preview/lib/browser/editor-preview-widget';
import { Disposable } from '@theia/core/shared/vscode-languageserver-protocol';
import { MonacoDiffEditor } from '@theia/monaco/lib/browser/monaco-diff-editor';
import { toUriComponents } from '../hierarchy/hierarchy-types-converters';
import { TerminalWidget } from '@theia/terminal/lib/browser/base/terminal-widget';

export class TabsMainImp implements TabsMain, Disposable {

    private readonly proxy: TabsExt;
    private tabGroupModel = new Map<TabBar<Widget>, TabGroupDto>();

    private applicationShell: ApplicationShell;

    private disposableTabBarListeners: Disposable[] = [];
    private toDisposeOnDestroy: Disposable[] = [];

    private GroupIdCounter = 0;

    private tabGroupChanged: boolean = false;

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

        this.toDisposeOnDestroy.push(
            this.applicationShell.mainPanelRenderer.onTabBarCreated(tabBar => {
                this.attachListenersToTabBar(tabBar);
                this.onTabGroupCreated(tabBar);
            })
        );

        this.connectToSignal(this.toDisposeOnDestroy, this.applicationShell.mainPanel.widgetAdded, (sender, widget) => {
            if (this.tabGroupChanged || this.tabGroupModel.size === 0) {
                this.tabGroupChanged = false;
                this.createTabsModel();
            } else {
                const tabBar = this.applicationShell.mainPanel.findTabBar(widget.title)!;
                this.onTabCreated(tabBar, { index: tabBar.titles.indexOf(widget.title), title: widget.title });
            }
        });

        this.connectToSignal(this.toDisposeOnDestroy, this.applicationShell.mainPanel.widgetRemoved, (sender, widget) => {
            if (!(widget instanceof TabBar)) {
                if (this.tabGroupChanged) {
                    this.tabGroupChanged = false;
                    this.createTabsModel();
                } else {
                    const tabBar = this.applicationShell.mainPanel.findTabBar(widget.title)!;
                    this.onTabClosed(tabBar, { index: tabBar.titles.indexOf(widget.title), title: widget.title });
                }
            }
        });
    }

    protected createTabsModel(): void {
        const newTabGroupModel = new Map<TabBar<Widget>, TabGroupDto>();
        this.disposableTabBarListeners.forEach(disposable => disposable.dispose());
        this.applicationShell.mainAreaTabBars.forEach(tabBar => {
            this.attachListenersToTabBar(tabBar);

            const groupDto = this.createTabGroupDto(tabBar);
            newTabGroupModel.set(tabBar, groupDto);
        });
        if (newTabGroupModel.size > 0 && !Array.from(newTabGroupModel.values()).some(groupDto => groupDto.isActive)) {
            newTabGroupModel.values().next().value.isActive = true; // allways needs one active group, so if there is none we just take the first one
        }
        this.tabGroupModel = newTabGroupModel;
        this.proxy.$acceptEditorTabModel(this.transformModelToArray());
    }

    protected createTabDto(tabTitle: Title<Widget>, groupId: number): TabDto {
        const activeTitle = this.applicationShell.mainPanel.currentTitle;
        const widget = tabTitle.owner;
        let isActive = false;
        if (activeTitle === tabTitle) {
            isActive = true;
        }
        return {
            id: this.generateTabId(tabTitle, groupId),
            label: tabTitle.label,
            input: this.evaluateTabDtoInput(widget),
            isActive,
            isPinned: tabTitle.className.includes(PINNED_CLASS),
            isDirty: Saveable.isDirty(widget),
            isPreview: widget instanceof EditorPreviewWidget && widget.isPreview
        };
    }

    protected generateTabId(tab: Title<Widget>, groupId: number): string {
        return `${groupId}~${tab.owner.id}`;
    }

    protected createTabGroupDto(tabBar: TabBar<Widget>): TabGroupDto {
        let groupIsActive = false;
        const oldDto = this.tabGroupModel.get(tabBar);
        const groupId = oldDto ? oldDto.groupId : this.GroupIdCounter++;
        const tabs: TabDto[] = tabBar.titles.map(title => {
            const tabDto = this.createTabDto(title, groupId);
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
        tabBar.titles.forEach(title => {
            this.connectToSignal(this.disposableTabBarListeners, title.changed, this.onTabTitleChanged);
        });

        this.connectToSignal(this.disposableTabBarListeners, tabBar.tabMoved, this.onTabMoved);
        this.connectToSignal(this.disposableTabBarListeners, tabBar.disposed, this.onTabGroupClosed);
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

    protected connectToSignal<T>(disposableList: Disposable[], signal: { connect(listener: T, context: unknown): void, disconnect(listener: T): void }, listener: T): void {
        signal.connect(listener, this);
        disposableList.push(Disposable.create(() => signal.disconnect(listener)));
    }

    protected transformModelToArray(): TabGroupDto[] {
        return Array.from(this.tabGroupModel.values());
    }

    protected tabDtosEqual(a: TabDto, b: TabDto): boolean {
        return a.isActive === b.isActive &&
            a.isDirty === b.isDirty &&
            a.isPinned === b.isPinned &&
            a.isPreview === b.isPreview &&
            a.id === b.id;
    }

    // #region event listeners
    private onTabCreated(tabBar: TabBar<Widget>, args: TabBar.ITabActivateRequestedArgs<Widget>): void {
        const group = this.tabGroupModel.get(tabBar)!;
        this.connectToSignal(this.disposableTabBarListeners, args.title.changed, this.onTabTitleChanged);
        const tabDto = this.createTabDto(args.title, group.groupId);
        group.tabs.splice(args.index, 0, tabDto);
        this.proxy.$acceptTabOperation({
            kind: TabModelOperationKind.TAB_OPEN,
            index: args.index,
            tabDto,
            groupId: group.groupId
        });
    }

    private onTabTitleChanged(title: Title<Widget>): void {
        const tabBar = this.applicationShell.mainPanel.findTabBar(title)!;
        const tabIndex = tabBar?.titles.indexOf(title);
        const group = this.tabGroupModel.get(tabBar);
        if (!group) {
            return;
        }
        const oldTabDto = group.tabs[tabIndex];
        const newTabDto = this.createTabDto(title, group.groupId);
        if (!this.tabDtosEqual(oldTabDto, newTabDto)) {
            if (!oldTabDto.isActive && newTabDto.isActive && !group.isActive) {
                group.isActive = true;
                this.proxy.$acceptTabGroupUpdate(group);
            }
            group.tabs.splice(tabIndex, 1, newTabDto);
            this.proxy.$acceptTabOperation({
                kind: TabModelOperationKind.TAB_UPDATE,
                index: tabIndex,
                tabDto: newTabDto,
                groupId: group.groupId
            });
        }
    }

    private onTabClosed(tabBar: TabBar<Widget>, args: TabBar.ITabCloseRequestedArgs<Widget>): void {
        const group = this.tabGroupModel.get(tabBar)!;
        group.tabs.splice(args.index, 1);
        this.proxy.$acceptTabOperation({
            kind: TabModelOperationKind.TAB_CLOSE,
            index: args.index,
            tabDto: this.createTabDto(args.title, group.groupId),
            groupId: group.groupId
        });
    }

    private onTabMoved(tabBar: TabBar<Widget>, args: TabBar.ITabMovedArgs<Widget>): void {
        const group = this.tabGroupModel.get(tabBar)!;
        const tabDto = this.createTabDto(args.title, group.groupId);
        group.tabs.splice(args.fromIndex, 1);
        group.tabs.splice(args.toIndex, 1, tabDto);
        this.proxy.$acceptTabOperation({
            kind: TabModelOperationKind.TAB_MOVE,
            index: args.toIndex,
            tabDto,
            groupId: group.groupId,
            oldIndex: args.fromIndex
        });
    }

    private onTabGroupCreated(tabBar: TabBar<Widget>): void {
        this.tabGroupChanged = true;
    }

    private onTabGroupClosed(tabBar: TabBar<Widget>): void {
        this.tabGroupChanged = true;
    }
    // #endregion

    // #region Messages received from Ext Host
    $moveTab(tabId: string, index: number, viewColumn: number, preserveFocus?: boolean): void {
        return;
    }

    async $closeTab(tabIds: string[], preserveFocus?: boolean): Promise<boolean> {
        for (const tabId of tabIds) {
            const widget = this.applicationShell.getWidgetById(tabId.substring(tabId.indexOf('~') + 1));
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
            const tabBar = Array.from(this.tabGroupModel.entries()).find(([, tabGroup]) => tabGroup.groupId === groupId)?.[0];
            if (tabBar) {
                tabBar.titles.forEach(title => title.owner.dispose());
            }
        }
        return true;
    }
    // #endregion

    dispose(): void {
        this.toDisposeOnDestroy.forEach(disposable => disposable.dispose());
        this.disposableTabBarListeners.forEach(disposable => disposable.dispose());
    }
}
