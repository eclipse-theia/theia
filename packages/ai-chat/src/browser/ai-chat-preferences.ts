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

import { AI_CORE_PREFERENCES_TITLE } from '@theia/ai-core/lib/browser/ai-core-preferences';
import { PreferenceSchema } from '@theia/core/lib/browser/preferences/preference-contribution';

export const DEFAULT_CHAT_AGENT_PREF = 'ai-features.chat.defaultChatAgent';

export const aiChatPreferences: PreferenceSchema = {
    type: 'object',
    properties: {
        [DEFAULT_CHAT_AGENT_PREF]: {
            type: 'string',
            description: 'Optional: <agent-name> of the Chat Agent that shall be invoked, if no agent is explicitly mentioned with @<agent-name> in the user query.\
            If no Default Agent is configured, Theia´s defaults will be applied.',
            title: AI_CORE_PREFERENCES_TITLE,
        }
    }
};
