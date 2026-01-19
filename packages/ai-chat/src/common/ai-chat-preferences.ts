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
import { nls, PreferenceSchema } from '@theia/core';

export const DEFAULT_CHAT_AGENT_PREF = 'ai-features.chat.defaultChatAgent';
export const PIN_CHAT_AGENT_PREF = 'ai-features.chat.pinChatAgent';
export const BYPASS_MODEL_REQUIREMENT_PREF = 'ai-features.chat.bypassModelRequirement';
export const PERSISTED_SESSION_LIMIT_PREF = 'ai-features.chat.persistedSessionLimit';
export const SESSION_STORAGE_SCOPE_PREF = 'ai-features.chat.sessionStorage.scope';
export const SESSION_STORAGE_WORKSPACE_PATH_PREF = 'ai-features.chat.sessionStorage.workspacePath';
export const SESSION_STORAGE_GLOBAL_PATH_PREF = 'ai-features.chat.sessionStorage.userPath';

export type SessionStorageScope = 'workspace' | 'global';

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
        [SESSION_STORAGE_SCOPE_PREF]: {
            type: 'string',
            enum: ['workspace', 'global'] satisfies SessionStorageScope[],
            enumDescriptions: [
                nls.localize('theia/ai/chat/sessionStorage/scope/workspace', 'Store chat sessions in the workspace folder.'),
                nls.localize('theia/ai/chat/sessionStorage/scope/global', 'Store chat sessions in the global configuration folder.')
            ],
            description: nls.localize('theia/ai/chat/sessionStorage/scope/description',
                'Choose where to store chat sessions. When set to "workspace", sessions are stored in the workspace folder. ' +
                'When set to "global", sessions are stored in the global configuration folder. ' +
                'If no workspace is open, sessions will use the global storage.'),
            default: 'workspace',
            title: AI_CORE_PREFERENCES_TITLE,
        },
        [SESSION_STORAGE_WORKSPACE_PATH_PREF]: {
            type: 'string',
            description: nls.localize('theia/ai/chat/sessionStorage/workspacePath/description',
                'Relative path within the workspace root where chat sessions are stored. ' +
                'If empty, then chats will not be persisted.'),
            default: '.theia/chatSessions',
            title: AI_CORE_PREFERENCES_TITLE,
            visibleWhen: "config.ai-features.chat.sessionStorage.scope == 'workspace'",
        },
        [SESSION_STORAGE_GLOBAL_PATH_PREF]: {
            type: 'string',
            description: nls.localize('theia/ai/chat/sessionStorage/userPath/description',
                'Absolute filesystem path where chat sessions are stored globally. ' +
                'Leave empty to use the default location ($HOME/.theia/chatSessions).'),
            default: '',
            title: AI_CORE_PREFERENCES_TITLE,
            visibleWhen: "config.ai-features.chat.sessionStorage.scope == 'global'",
        }
    }
};
