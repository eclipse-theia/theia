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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import * as theia from '@theia/plugin';
import { Emitter } from '@theia/core';
import { RPCProtocol } from '../common/rpc-protocol';
import { PLUGIN_RPC_CONTEXT, TabDto, TabGroupDto, TabInputKind, TabModelOperationKind, TabOperation, TabsExt, TabsMain } from '../common/plugin-api-rpc';
import {
    CustomEditorTabInput,
    InteractiveWindowInput,
    NotebookDiffEditorTabInput,
    NotebookEditorTabInput,
    TerminalEditorTabInput,
    TextDiffTabInput,
    TextMergeTabInput,
    TextTabInput,
    URI,
    WebviewEditorTabInput
} from './types-impl';
import { assertIsDefined } from '../common/types';
import { diffSets } from '../common/collections';
import { ViewColumn } from './type-converters';

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// some code copied and modified from https://github.com/microsoft/vscode/blob/1.71.2/src/vs/workbench/api/common/extHostEditorTabs.ts

type AnyTabInput =
    TextTabInput |
    TextDiffTabInput |
    CustomEditorTabInput |
    NotebookEditorTabInput |
    NotebookDiffEditorTabInput |
    WebviewEditorTabInput |
    TerminalEditorTabInput |
    InteractiveWindowInput;

class TabExt {
    private tabApiObject: theia.Tab | undefined;
    private tabDto!: TabDto;
    private input: AnyTabInput | undefined;
    private parentGroup: TabGroupExt;
    private readonly activeTabIdGetter: () => string;

    constructor(dto: TabDto, parentGroup: TabGroupExt, activeTabIdGetter: () => string) {
        this.activeTabIdGetter = activeTabIdGetter;
        this.parentGroup = parentGroup;
        this.acceptDtoUpdate(dto);
    }

    get apiObject(): theia.Tab {
        if (!this.tabApiObject) {
            // Don't want to lose reference to parent `this` in the getters
            const that = this;
            const obj: theia.Tab = {
                get isActive(): boolean {
                    // We use a getter function here to always ensure at most 1 active tab per group and prevent iteration for being required
                    return that.tabDto.id === that.activeTabIdGetter();
                },
                get label(): string {
                    return that.tabDto.label;
                },
                get input(): AnyTabInput | undefined {
                    return that.input;
                },
                get isDirty(): boolean {
                    return that.tabDto.isDirty;
                },
                get isPinned(): boolean {
                    return that.tabDto.isPinned;
                },
                get isPreview(): boolean {
                    return that.tabDto.isPreview;
                },
                get group(): theia.TabGroup {
                    return that.parentGroup.apiObject;
                }
            };
            this.tabApiObject = Object.freeze<theia.Tab>(obj);
        }
        return this.tabApiObject;
    }

    get tabId(): string {
        return this.tabDto.id;
    }

    acceptDtoUpdate(tabDto: TabDto): void {
        this.tabDto = tabDto;
        this.input = this.initInput();
    }

    private initInput(): AnyTabInput | undefined {
        switch (this.tabDto.input.kind) {
            case TabInputKind.TextInput:
                return new TextTabInput(URI.revive(this.tabDto.input.uri));
            case TabInputKind.TextDiffInput:
                return new TextDiffTabInput(URI.revive(this.tabDto.input.original), URI.revive(this.tabDto.input.modified));
            case TabInputKind.TextMergeInput:
                return new TextMergeTabInput(
                    URI.revive(this.tabDto.input.base),
                    URI.revive(this.tabDto.input.input1),
                    URI.revive(this.tabDto.input.input2),
                    URI.revive(this.tabDto.input.result));
            case TabInputKind.CustomEditorInput:
                return new CustomEditorTabInput(URI.revive(this.tabDto.input.uri), this.tabDto.input.viewType);
            case TabInputKind.WebviewEditorInput:
                return new WebviewEditorTabInput(this.tabDto.input.viewType);
            case TabInputKind.NotebookInput:
                return new NotebookEditorTabInput(URI.revive(this.tabDto.input.uri), this.tabDto.input.notebookType);
            case TabInputKind.NotebookDiffInput:
                return new NotebookDiffEditorTabInput(URI.revive(this.tabDto.input.original), URI.revive(this.tabDto.input.modified), this.tabDto.input.notebookType);
            case TabInputKind.TerminalEditorInput:
                return new TerminalEditorTabInput();
            case TabInputKind.InteractiveEditorInput:
                return new InteractiveWindowInput(URI.revive(this.tabDto.input.uri), URI.revive(this.tabDto.input.inputBoxUri));
            default:
                return undefined;
        }
    }
}

class TabGroupExt {

    private tabGroupApiObject: theia.TabGroup | undefined;
    private tabGroupDto: TabGroupDto;
    private tabsArr: TabExt[] = [];
    private activeTabId: string = '';
    private activeGroupIdGetter: () => number | undefined;

    constructor(dto: TabGroupDto, activeGroupIdGetter: () => number | undefined) {
        this.tabGroupDto = dto;
        this.activeGroupIdGetter = activeGroupIdGetter;
        // Construct all tabs from the given dto
        for (const tabDto of dto.tabs) {
            if (tabDto.isActive) {
                this.activeTabId = tabDto.id;
            }
            this.tabsArr.push(new TabExt(tabDto, this, () => this.getActiveTabId()));
        }
    }

    get apiObject(): theia.TabGroup {
        if (!this.tabGroupApiObject) {
            // Don't want to lose reference to parent `this` in the getters
            const that = this;
            const obj: theia.TabGroup = {
                get isActive(): boolean {
                    // We use a getter function here to always ensure at most 1 active group and prevent iteration for being required
                    return that.tabGroupDto.groupId === that.activeGroupIdGetter();
                },
                get viewColumn(): theia.ViewColumn {
                    return ViewColumn.to(that.tabGroupDto.viewColumn);
                },
                get activeTab(): theia.Tab | undefined {
                    return that.tabsArr.find(tab => tab.tabId === that.activeTabId)?.apiObject;
                },
                get tabs(): Readonly<theia.Tab[]> {
                    return Object.freeze(that.tabsArr.map(tab => tab.apiObject));
                }
            };
            this.tabGroupApiObject = Object.freeze<theia.TabGroup>(obj);
        }
        return this.tabGroupApiObject;
    }

    get groupId(): number {
        return this.tabGroupDto.groupId;
    }

    get tabs(): TabExt[] {
        return this.tabsArr;
    }

    acceptGroupDtoUpdate(dto: TabGroupDto): void {
        this.tabGroupDto = dto;
    }

    acceptTabOperation(operation: TabOperation): TabExt {
        // In the open case we add the tab to the group
        if (operation.kind === TabModelOperationKind.TAB_OPEN) {
            const tab = new TabExt(operation.tabDto, this, () => this.getActiveTabId());
            // Insert tab at editor index
            this.tabsArr.splice(operation.index, 0, tab);
            if (operation.tabDto.isActive) {
                this.activeTabId = tab.tabId;
            }
            return tab;
        } else if (operation.kind === TabModelOperationKind.TAB_CLOSE) {
            const tab = this.tabsArr.splice(operation.index, 1)[0];
            if (!tab) {
                throw new Error(`Tab close updated received for index ${operation.index} which does not exist`);
            }
            if (tab.tabId === this.activeTabId) {
                this.activeTabId = '';
            }
            return tab;
        } else if (operation.kind === TabModelOperationKind.TAB_MOVE) {
            if (operation.oldIndex === undefined) {
                throw new Error('Invalid old index on move IPC');
            }
            // Splice to remove at old index and insert at new index === moving the tab
            const tab = this.tabsArr.splice(operation.oldIndex, 1)[0];
            if (!tab) {
                throw new Error(`Tab move updated received for index ${operation.oldIndex} which does not exist`);
            }
            this.tabsArr.splice(operation.index, 0, tab);
            return tab;
        }
        const _tab = this.tabsArr.find(extHostTab => extHostTab.tabId === operation.tabDto.id);
        if (!_tab) {
            throw new Error('INVALID tab');
        }
        if (operation.tabDto.isActive) {
            this.activeTabId = operation.tabDto.id;
        } else if (this.activeTabId === operation.tabDto.id && !operation.tabDto.isActive) {
            // Events aren't guaranteed to be in order so if we receive a dto that matches the active tab id
            // but isn't active we mark the active tab id as empty. This prevent onDidActiveTabChange from
            // firing incorrectly
            this.activeTabId = '';
        }
        _tab.acceptDtoUpdate(operation.tabDto);
        return _tab;
    }

    // Not a getter since it must be a function to be used as a callback for the tabs
    getActiveTabId(): string {
        return this.activeTabId;
    }
}

export class TabsExtImpl implements TabsExt {
    declare readonly _serviceBrand: undefined;

    private readonly proxy: TabsMain;
    private readonly onDidChangeTabs = new Emitter<theia.TabChangeEvent>();
    private readonly onDidChangeTabGroups = new Emitter<theia.TabGroupChangeEvent>();

    // Have to use ! because this gets initialized via an RPC proxy
    private activeGroupId!: number;

    private tabGroupArr: TabGroupExt[] = [];

    private apiObject: theia.TabGroups | undefined;

    constructor(readonly rpc: RPCProtocol) {
        this.proxy = rpc.getProxy(PLUGIN_RPC_CONTEXT.TABS_MAIN);
    }

    get tabGroups(): theia.TabGroups {
        if (!this.apiObject) {
            const that = this;
            const obj: theia.TabGroups = {
                // never changes -> simple value
                onDidChangeTabGroups: that.onDidChangeTabGroups.event,
                onDidChangeTabs: that.onDidChangeTabs.event,
                // dynamic -> getters
                get all(): Readonly<theia.TabGroup[]> {
                    return Object.freeze(that.tabGroupArr.map(group => group.apiObject));
                },
                get activeTabGroup(): theia.TabGroup {
                    const activeTabGroupId = that.activeGroupId;
                    const activeTabGroup = assertIsDefined(that.tabGroupArr.find(candidate => candidate.groupId === activeTabGroupId)?.apiObject);
                    return activeTabGroup;
                },
                close: async (tabOrTabGroup: theia.Tab | readonly theia.Tab[] | theia.TabGroup | readonly theia.TabGroup[], preserveFocus?: boolean) => {
                    const tabsOrTabGroups = Array.isArray(tabOrTabGroup) ? tabOrTabGroup : [tabOrTabGroup];
                    if (!tabsOrTabGroups.length) {
                        return true;
                    }
                    // Check which type was passed in and call the appropriate close
                    // Casting is needed as typescript doesn't seem to infer enough from this
                    if (isTabGroup(tabsOrTabGroups[0])) {
                        return this._closeGroups(tabsOrTabGroups as theia.TabGroup[], preserveFocus);
                    } else {
                        return this._closeTabs(tabsOrTabGroups as theia.Tab[], preserveFocus);
                    }
                },
            };
            this.apiObject = Object.freeze(obj);
        }
        return this.apiObject;
    }

    $acceptEditorTabModel(tabGroups: TabGroupDto[]): void {
        const groupIdsBefore = new Set(this.tabGroupArr.map(group => group.groupId));
        const groupIdsAfter = new Set(tabGroups.map(dto => dto.groupId));
        const diff = diffSets(groupIdsBefore, groupIdsAfter);

        const closed: theia.TabGroup[] = this.tabGroupArr.filter(group => diff.removed.includes(group.groupId)).map(group => group.apiObject);
        const opened: theia.TabGroup[] = [];
        const changed: theia.TabGroup[] = [];
        const tabsOpened: theia.Tab[] = [];

        this.tabGroupArr = tabGroups.map(tabGroup => {
            const group = new TabGroupExt(tabGroup, () => this.activeGroupId);
            if (diff.added.includes(group.groupId)) {
                opened.push({ activeTab: undefined, isActive: group.apiObject.isActive, tabs: [], viewColumn: group.apiObject.viewColumn });
                tabsOpened.push(...group.apiObject.tabs);
            } else {
                changed.push(group.apiObject);
            }
            return group;
        });

        // Set the active tab group id. skip if no tabgroups are open
        if (tabGroups.length > 0) {
            const activeTabGroupId = assertIsDefined(tabGroups.find(group => group.isActive === true)?.groupId);
            if (this.activeGroupId !== activeTabGroupId) {
                this.activeGroupId = activeTabGroupId;
            }
        }

        if (closed.length > 0 || opened.length > 0 || changed.length > 0) {
            this.onDidChangeTabGroups.fire(Object.freeze({ opened, closed, changed }));
        }
        if (tabsOpened.length > 0) {
            this.onDidChangeTabs.fire({ opened: tabsOpened, changed: [], closed: [] });
        }
    }

    $acceptTabGroupUpdate(groupDto: TabGroupDto): void {
        const group = this.tabGroupArr.find(tabGroup => tabGroup.groupId === groupDto.groupId);
        if (!group) {
            throw new Error('Update Group IPC call received before group creation.');
        }
        group.acceptGroupDtoUpdate(groupDto);
        if (groupDto.isActive) {
            this.activeGroupId = groupDto.groupId;
        }
        this.onDidChangeTabGroups.fire(Object.freeze({ changed: [group.apiObject], opened: [], closed: [] }));
    }

    $acceptTabOperation(operation: TabOperation): void {
        const group = this.tabGroupArr.find(tabGroup => tabGroup.groupId === operation.groupId);
        if (!group) {
            throw new Error('Update Tabs IPC call received before group creation.');
        }
        const tab = group.acceptTabOperation(operation);

        // Construct the tab change event based on the operation
        switch (operation.kind) {
            case TabModelOperationKind.TAB_OPEN:
                this.onDidChangeTabs.fire(Object.freeze({
                    opened: [tab.apiObject],
                    closed: [],
                    changed: []
                }));
                return;
            case TabModelOperationKind.TAB_CLOSE:
                this.onDidChangeTabs.fire(Object.freeze({
                    opened: [],
                    closed: [tab.apiObject],
                    changed: []
                }));
                return;
            case TabModelOperationKind.TAB_MOVE:
            case TabModelOperationKind.TAB_UPDATE:
                this.onDidChangeTabs.fire(Object.freeze({
                    opened: [],
                    closed: [],
                    changed: [tab.apiObject]
                }));
                return;
        }
    }

    private _findExtHostTabFromApi(apiTab: theia.Tab): TabExt | undefined {
        for (const group of this.tabGroupArr) {
            for (const tab of group.tabs) {
                if (tab.apiObject === apiTab) {
                    return tab;
                }
            }
        }
        return;
    }

    private _findExtHostTabGroupFromApi(apiTabGroup: theia.TabGroup): TabGroupExt | undefined {
        return this.tabGroupArr.find(candidate => candidate.apiObject === apiTabGroup);
    }

    private async _closeTabs(tabs: theia.Tab[], preserveFocus?: boolean): Promise<boolean> {
        const extHostTabIds: string[] = [];
        for (const tab of tabs) {
            const extHostTab = this._findExtHostTabFromApi(tab);
            if (!extHostTab) {
                throw new Error('Tab close: Invalid tab not found!');
            }
            extHostTabIds.push(extHostTab.tabId);
        }
        return this.proxy.$closeTab(extHostTabIds, preserveFocus);
    }

    private async _closeGroups(groups: theia.TabGroup[], preserveFocus?: boolean): Promise<boolean> {
        const extHostGroupIds: number[] = [];
        for (const group of groups) {
            const extHostGroup = this._findExtHostTabGroupFromApi(group);
            if (!extHostGroup) {
                throw new Error('Group close: Invalid group not found!');
            }
            extHostGroupIds.push(extHostGroup.groupId);
        }
        return this.proxy.$closeGroup(extHostGroupIds, preserveFocus);
    }
}

// #region Utils
function isTabGroup(obj: unknown): obj is theia.TabGroup {
    const tabGroup = obj as theia.TabGroup;
    if (tabGroup.tabs !== undefined) {
        return true;
    }
    return false;
}
// #endregion
