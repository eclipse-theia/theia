/********************************************************************************
 * Copyright (C) 2020 Ericsson and others.
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

import {
    PreferenceDataProperty,
    PreferenceScope,
    TreeNode as BaseTreeNode,
    CompositeTreeNode as BaseCompositeTreeNode,
    PreferenceInspection,
    CommonCommands,
} from '@theia/core/lib/browser';
import { Command, MenuPath } from '@theia/core';
import { JSONValue } from '@theia/core/shared/@phosphor/coreutils';

export namespace Preference {

    export interface EditorCommandArgs {
        id: string;
        value: string | undefined;
    }

    export namespace EditorCommandArgs {
        export function is(prefObject: EditorCommandArgs): prefObject is EditorCommandArgs {
            return !!prefObject && 'id' in prefObject && 'value' in prefObject;
        }
    }

    export const Node = Symbol('Preference.Node');
    export type Node = TreeNode;

    export type TreeNode = CompositeTreeNode | LeafNode;

    export namespace TreeNode {
        export const is = (node: BaseTreeNode | TreeNode): node is TreeNode => 'depth' in node;
        export const isTopLevel = (node: BaseTreeNode): boolean => {
            const { group, id } = getGroupAndIdFromNodeId(node.id);
            return group === id;
        };
        export const getGroupAndIdFromNodeId = (nodeId: string): { group: string; id: string } => {
            const separator = nodeId.indexOf('@');
            const group = nodeId.substring(0, separator);
            const id = nodeId.substring(separator + 1, nodeId.length);
            return { group, id };
        };
    }

    export interface CompositeTreeNode extends BaseCompositeTreeNode {
        depth: number;
    }

    export interface LeafNode extends BaseTreeNode {
        depth: number;
        preference: { data: PreferenceDataProperty };
    }

    export namespace LeafNode {
        export const is = (node: BaseTreeNode | LeafNode): node is LeafNode => 'preference' in node && !!node.preference.data;
    }

    export const getValueInScope = <T extends JSONValue>(preferenceInfo: PreferenceInspection<T> | undefined, scope: number): T | undefined => {
        if (!preferenceInfo) {
            return undefined;
        }
        switch (scope) {
            case PreferenceScope.User:
                return preferenceInfo.globalValue;
            case PreferenceScope.Workspace:
                return preferenceInfo.workspaceValue;
            case PreferenceScope.Folder:
                return preferenceInfo.workspaceFolderValue;
            default:
                return undefined;
        }
    };

    export interface SelectedScopeDetails {
        scope: number;
        uri: string | undefined;
        activeScopeIsFolder: boolean;
    };

    export const DEFAULT_SCOPE: SelectedScopeDetails = {
        scope: PreferenceScope.User,
        uri: undefined,
        activeScopeIsFolder: false
    };

    /**
     * @deprecated since 1.15.0 this type is no longer used.
     */
    export interface ContextMenuCallbacks {
        resetCallback(): void;
        copyIDCallback(): void;
        copyJSONCallback(): void;
    }
}

export namespace PreferencesCommands {
    export const OPEN_PREFERENCES_JSON_TOOLBAR: Command = {
        id: 'preferences:openJson.toolbar',
        iconClass: 'codicon codicon-json'
    };
    export const COPY_JSON_NAME = Command.toLocalizedCommand({
        id: 'preferences:copyJson.name',
        label: 'Copy Setting ID'
    }, 'vscode/settingsTree/copySettingIdLabel');
    export const RESET_PREFERENCE = Command.toLocalizedCommand({
        id: 'preferences:reset',
        label: 'Reset Setting'
    }, 'vscode/settingsTree/resetSettingLabel');

    export const COPY_JSON_VALUE = Command.toLocalizedCommand({
        id: 'preferences:copyJson.value',
        label: 'Copy Setting as JSON',
    }, 'vscode/settingsTree/copySettingAsJSONLabel');

    export const OPEN_USER_PREFERENCES = Command.toLocalizedCommand({
        id: 'workbench.action.openGlobalSettings',
        category: CommonCommands.PREFERENCES_CATEGORY,
        label: 'Open User Settings',
    }, 'vscode/preferences.contribution/openGlobalSettings', CommonCommands.PREFERENCES_CATEGORY_KEY);

    export const OPEN_WORKSPACE_PREFERENCES = Command.toLocalizedCommand({
        id: 'workbench.action.openWorkspaceSettings',
        category: CommonCommands.PREFERENCES_CATEGORY,
        label: 'Open Workspace Settings',
    }, 'vscode/preferences.contribution/openWorkspaceSettings', CommonCommands.PREFERENCES_CATEGORY_KEY);

    export const OPEN_FOLDER_PREFERENCES = Command.toLocalizedCommand({
        id: 'workbench.action.openFolderSettings',
        category: CommonCommands.PREFERENCES_CATEGORY,
        label: 'Open Folder Settings'
    }, 'vscode/preferences.contribution/openFolderSettings', CommonCommands.PREFERENCES_CATEGORY_KEY);

    export const OPEN_USER_PREFERENCES_JSON = Command.toLocalizedCommand({
        id: 'workbench.action.openSettingsJson',
        category: CommonCommands.PREFERENCES_CATEGORY,
        label: 'Open Settings (JSON)'
    }, 'vscode/preferences.contribution/openSettingsJson', CommonCommands.PREFERENCES_CATEGORY_KEY);

    export const OPEN_WORKSPACE_PREFERENCES_JSON = Command.toLocalizedCommand({
        id: 'workbench.action.openWorkspaceSettingsFile',
        category: CommonCommands.PREFERENCES_CATEGORY,
        label: 'Open Workspace Settings (JSON)',
    }, 'vscode/preferences.contribution/openWorkspaceSettingsFile', CommonCommands.PREFERENCES_CATEGORY_KEY);

    export const OPEN_FOLDER_PREFERENCES_JSON = Command.toLocalizedCommand({
        id: 'workbench.action.openFolderSettingsFile',
        category: CommonCommands.PREFERENCES_CATEGORY,
        label: 'Open Folder Settings (JSON)',
    }, 'vscode/preferences.contribution/openFolderSettingsFile', CommonCommands.PREFERENCES_CATEGORY_KEY);
}

export namespace PreferenceMenus {
    export const PREFERENCE_EDITOR_CONTEXT_MENU: MenuPath = ['preferences:editor.contextMenu'];
    export const PREFERENCE_EDITOR_COPY_ACTIONS: MenuPath = [...PREFERENCE_EDITOR_CONTEXT_MENU, 'preferences:editor.contextMenu.copy'];
    export const FOLDER_SCOPE_MENU_PATH = ['preferences:scope.menu'];
}
