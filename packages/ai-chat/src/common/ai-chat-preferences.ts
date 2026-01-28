// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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

import { AI_CORE_PREFERENCES_TITLE } from '@theia/ai-core/lib/common/ai-core-preferences';
import { isObject, nls, PreferenceSchema } from '@theia/core';

export const DEFAULT_CHAT_AGENT_PREF = 'ai-features.chat.defaultChatAgent';
export const PIN_CHAT_AGENT_PREF = 'ai-features.chat.pinChatAgent';
export const BYPASS_MODEL_REQUIREMENT_PREF = 'ai-features.chat.bypassModelRequirement';
export const PERSISTED_SESSION_LIMIT_PREF = 'ai-features.chat.persistedSessionLimit';
export const SESSION_STORAGE_PREF = 'ai-features.chat.sessionStorage';

export type SessionStorageScope = 'workspace' | 'global';

/**
 * Session storage preference value structure.
 */
export interface SessionStorageValue {
    /** Where to store chat sessions: 'workspace' or 'global' */
    scope: SessionStorageScope;
    /** Relative path within the workspace root where chat sessions are stored */
    workspacePath: string;
    /** Absolute filesystem path where chat sessions are stored globally */
    globalPath: string;
}

export namespace SessionStorageValue {
    export const DEFAULT: SessionStorageValue = Object.freeze({
        scope: 'workspace' as SessionStorageScope,
        workspacePath: '.theia/chatSessions',
        globalPath: ''
    });

    export function is(value: unknown): value is SessionStorageValue {
        return isObject<SessionStorageValue>(value) &&
            (value.scope === 'workspace' || value.scope === 'global') &&
            typeof value.workspacePath === 'string' &&
            typeof value.globalPath === 'string';
    }

    export function create(withValues?: Partial<SessionStorageValue>): SessionStorageValue {
        if (!withValues) {
            return { ...DEFAULT };
        }
        return {
            scope: withValues.scope ?? DEFAULT.scope,
            workspacePath: withValues.workspacePath ?? DEFAULT.workspacePath,
            globalPath: withValues.globalPath ?? DEFAULT.globalPath
        };
    }

    /** Localized labels and descriptions for the session storage preference UI */
    export namespace Labels {
        export const scopeWorkspace = (): string => nls.localizeByDefault('workspace');
        export const scopeGlobal = (): string => nls.localizeByDefault('global');
        export const scopeWorkspaceDescription = (): string =>
            nls.localize('theia/ai/chat/sessionStorage/scope/workspace', 'Store chat sessions in the workspace folder.');
        export const scopeGlobalDescription = (): string =>
            nls.localize('theia/ai/chat/sessionStorage/scope/global', 'Store chat sessions in the global configuration folder.');
        export const workspacePathLabel = (): string =>
            nls.localize('theia/ai/chat/sessionStorage/workspacePath', 'Workspace Path');
        export const workspacePathDescription = (): string =>
            nls.localize('theia/ai/chat/sessionStorage/workspacePath/description',
                'Relative path within the workspace root where chat sessions are stored.');
        export const globalPathLabel = (): string =>
            nls.localize('theia/ai/chat/sessionStorage/globalPath', 'Global Path');
        export const globalPathDescription = (): string =>
            nls.localize('theia/ai/chat/sessionStorage/globalPath/description',
                'Absolute filesystem path where chat sessions are stored globally.');
        export const pathRequired = (): string =>
            nls.localize('theia/ai/chat/sessionStorage/pathRequired',
                'Path cannot be empty');
        export const workspacePathInvalidRelative = (): string =>
            nls.localize('theia/ai/chat/sessionStorage/workspacePath/invalidRelative',
                'Path must be relative (cannot start with / or drive letter)');
        export const workspacePathEscapesWorkspace = (): string =>
            nls.localize('theia/ai/chat/sessionStorage/workspacePath/escapesWorkspace',
                'Path must not escape the workspace root');
        export const globalPathInvalidAbsolute = (): string =>
            nls.localize('theia/ai/chat/sessionStorage/globalPath/invalidAbsolute',
                'Path must be an absolute path (starting with / or drive letter)');
        export const pathSettings = (): string =>
            nls.localize('theia/ai/chat/sessionStorage/pathSettings', 'Path Settings');
        export const resetToDefault = (): string =>
            nls.localize('theia/ai/chat/sessionStorage/resetToDefault', 'Reset to default');
        export const pathNotUsedForScope = (activeScope: string): string =>
            nls.localize('theia/ai/chat/sessionStorage/pathNotUsedForScope',
                'Not used with {0} storage scope.', activeScope);
    }
}

/**
 * Type details marker for the session storage preference.
 * Used by the custom preference renderer to identify this preference.
 */
export interface SessionStorageTypeDetails {
    isSessionStorage: true;
}

export namespace SessionStorageTypeDetails {
    export function is(typeDetails: unknown): typeDetails is SessionStorageTypeDetails {
        return isObject<SessionStorageTypeDetails>(typeDetails) && typeDetails.isSessionStorage === true;
    }
}

export const aiChatPreferences: PreferenceSchema = {
    properties: {
        [DEFAULT_CHAT_AGENT_PREF]: {
            type: 'string',
            description: nls.localize('theia/ai/chat/defaultAgent/description',
                'Optional: <agent-name> of the Chat Agent that shall be invoked, if no agent is explicitly mentioned with @<agent-name> in the user query. \
        If no Default Agent is configured, Theia´s defaults will be applied.'),
            title: AI_CORE_PREFERENCES_TITLE,
        },
        [PIN_CHAT_AGENT_PREF]: {
            type: 'boolean',
            description: nls.localize('theia/ai/chat/pinChatAgent/description',
                'Enable agent pinning to automatically keep a mentioned chat agent active across prompts, reducing the need for repeated mentions.\
        You can manually unpin or switch agents anytime.'),
            default: true,
            title: AI_CORE_PREFERENCES_TITLE,
        },
        [BYPASS_MODEL_REQUIREMENT_PREF]: {
            type: 'boolean',
            description: nls.localize('theia/ai/chat/bypassModelRequirement/description',
                'Bypass the language model requirement check. Enable this if you are using external agents (e.g., Claude Code) that do not require Theia language models.'),
            default: false,
            title: AI_CORE_PREFERENCES_TITLE,
        },
        [PERSISTED_SESSION_LIMIT_PREF]: {
            type: 'number',
            description: nls.localize('theia/ai/chat/persistedSessionLimit/description',
                'Maximum number of chat sessions to persist. Use -1 for unlimited sessions, 0 to disable session persistence. ' +
                'When the limit is reduced, the oldest sessions exceeding the new limit are automatically removed on the next save.'),
            default: 25,
            minimum: -1,
            title: AI_CORE_PREFERENCES_TITLE,
        },
        [SESSION_STORAGE_PREF]: {
            type: 'object',
            description: nls.localize('theia/ai/chat/sessionStorage/description',
                'Configure where to store chat sessions.'),
            default: SessionStorageValue.DEFAULT,
            properties: {
                scope: {
                    type: 'string',
                    enum: ['workspace', 'global'] satisfies SessionStorageScope[],
                    enumDescriptions: [
                        SessionStorageValue.Labels.scopeWorkspaceDescription(),
                        SessionStorageValue.Labels.scopeGlobalDescription()
                    ],
                    description: nls.localize('theia/ai/chat/sessionStorage/scope/description',
                        'Choose where to store chat sessions. When set to "workspace", sessions are stored in the workspace folder. ' +
                        'When set to "global", sessions are stored in the global configuration folder. ' +
                        'If no workspace is open, sessions will use the global storage.'),
                    default: 'workspace'
                },
                workspacePath: {
                    type: 'string',
                    description: nls.localize('theia/ai/chat/sessionStorage/workspacePath/description',
                        'Relative path within the workspace root where chat sessions are stored.'),
                    default: '.theia/chatSessions'
                },
                globalPath: {
                    type: 'string',
                    description: nls.localize('theia/ai/chat/sessionStorage/globalPath/description',
                        'Absolute filesystem path where chat sessions are stored globally.'),
                    default: ''
                }
            },
            typeDetails: { isSessionStorage: true } as SessionStorageTypeDetails,
            title: AI_CORE_PREFERENCES_TITLE,
        }
    }
};
