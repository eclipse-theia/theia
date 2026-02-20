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
export const SESSION_STORAGE_PREF = 'ai-features.chat.sessionStorageScope';
export const WELCOME_SCREEN_SESSIONS_PREF = 'ai-features.chat.welcomeScreenSessions';

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
        [WELCOME_SCREEN_SESSIONS_PREF]: {
            type: 'number',
            description: nls.localize('theia/ai/chat/welcomeScreenSessions/description',
                'Number of rows of recent chat sessions to display on the welcome screen. The number of visible sessions depends ' +
                'on the available width. Set to 0 to hide the recent chats section.'),
            default: 3,
            minimum: 0,
            maximum: 6,
            title: AI_CORE_PREFERENCES_TITLE,
        },
        [SESSION_STORAGE_PREF]: {
            type: 'string',
            enum: ['workspace', 'global'] satisfies SessionStorageScope[],
            enumDescriptions: [
                nls.localize('theia/ai/chat/sessionStorageScope/workspace',
                    'Store chat sessions in workspace-specific metadata storage. Sessions are associated with the workspace but stored outside the workspace directory.'),
                nls.localize('theia/ai/chat/sessionStorageScope/global',
                    'Store chat sessions in a single store, shared across all workspaces.')
            ],
            default: 'workspace' as SessionStorageScope,
            description: nls.localize('theia/ai/chat/sessionStorageScope/description',
                'Choose whether to persist chat sessions in separate per-workspace stores or in a single global store. ' +
                'If no workspace is open, sessions will fall back to global storage.'),
            title: AI_CORE_PREFERENCES_TITLE,
        }
    }
};
