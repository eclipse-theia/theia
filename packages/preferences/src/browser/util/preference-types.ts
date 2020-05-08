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

import { PreferenceDataProperty, SelectableTreeNode, PreferenceItem, Title, PreferenceScope, TreeNode, CompositeTreeNode, ExpandableTreeNode } from '@theia/core/lib/browser';
import { Command, MenuPath } from '@theia/core';

export namespace Preference {
    interface MaximalTree extends SelectableTreeNode, ExpandableTreeNode {
        leaves: TreeExtension[];
    }

    export type TreeExtension = TreeNode & {
        expanded?: MaximalTree['expanded'];
        selected?: MaximalTree['selected'];
        focus?: MaximalTree['focus'];
        children?: MaximalTree['children'];
        leaves?: MaximalTree['leaves'];
    };

    export interface Branch extends CompositeTreeNode {
        leaves: TreeExtension[];
    }

    export namespace Branch {
        export function is(node: TreeNode | Branch): node is Branch {
            return 'leaves' in node && Array.isArray(node.leaves);
        }
    }

    export interface ValueInSingleScope { value?: PreferenceItem, data: PreferenceDataProperty; }
    export interface NodeWithValueInSingleScope extends SelectableTreeNode {
        preference: ValueInSingleScope;
    }

    export interface ValuesInAllScopes {
        preferenceName: string;
        defaultValue: PreferenceItem | undefined;
        globalValue: PreferenceItem | undefined;
        workspaceValue: PreferenceItem | undefined;
        workspaceFolderValue: PreferenceItem | undefined;
    }

    export interface PreferenceWithValueInAllScopes {
        values?: ValuesInAllScopes;
        data: PreferenceDataProperty;
    }

    export interface EditorCommandArgs {
        id: string;
        value: string | undefined;
    }

    export namespace EditorCommandArgs {
        export function is(prefObject: EditorCommandArgs): prefObject is EditorCommandArgs {
            return !!prefObject && 'id' in prefObject && 'value' in prefObject;
        }
    }

    export interface NodeWithValueInAllScopes extends SelectableTreeNode {
        preference: PreferenceWithValueInAllScopes;
    }

    export enum LookupKeys {
        defaultValue,
        globalValue,
        workspaceValue,
        workspaceFolderValue,
    }

    export interface SelectedScopeDetails extends Title.Dataset {
        scope: string;
        uri: string;
        activeScopeIsFolder: string;
    };

    export const DEFAULT_SCOPE: SelectedScopeDetails = {
        scope: PreferenceScope.User.toString(),
        uri: '',
        activeScopeIsFolder: 'false'
    };

    export interface SearchQuery {
        query: string;
    };

    export interface MouseScrollDetails {
        firstVisibleChildId: string;
        isTop: boolean;
    };

    export interface SelectedTreeNode {
        nodeID: string;
    }

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
    export const COPY_JSON_NAME: Command = {
        id: 'preferences:copyJson.name',
        label: 'Copy Setting ID'
    };
    export const RESET_PREFERENCE: Command = {
        id: 'preferences:reset',
        label: 'Reset Setting'
    };

    export const COPY_JSON_VALUE: Command = {
        id: 'preferences:copyJson.value',
        label: 'Copy Setting as JSON',
    };
}

export namespace PreferenceMenus {
    export const PREFERENCE_EDITOR_CONTEXT_MENU: MenuPath = ['preferences:editor.contextMenu'];
    export const PREFERENCE_EDITOR_COPY_ACTIONS: MenuPath = [...PREFERENCE_EDITOR_CONTEXT_MENU, 'preferences:editor.contextMenu.copy'];
}
