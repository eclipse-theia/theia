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

import { PreferenceSchema } from '@theia/core/lib/browser/preferences/preference-contribution';
import { AI_CORE_PREFERENCES_TITLE } from '@theia/ai-core/lib/browser/ai-core-preferences';

export const PREF_AI_CODE_COMPLETION_ENABLE = 'ai-features.code-completion.enable';
export const PREF_AI_CODE_COMPLETION_PRECOMPUTE = 'ai-features.code-completion.precompute';
export const PREF_AI_INLINE_COMPLETION_ENABLE = 'ai-features.code-completion-inline.enable';

export const AICodeCompletionPreferencesSchema: PreferenceSchema = {
    type: 'object',
    properties: {
        [PREF_AI_CODE_COMPLETION_ENABLE]: {
            title: AI_CORE_PREFERENCES_TITLE,
            type: 'boolean',
            description: 'Enable AI completion items within any (Monaco) editor.',
            default: false
        },
        [PREF_AI_CODE_COMPLETION_PRECOMPUTE]: {
            title: AI_CORE_PREFERENCES_TITLE,
            type: 'boolean',
            description: 'Precompute AI completion items. This will improve completion previews, however it will trigger many more requests and will take longer to complete.',
            default: false
        },
        [PREF_AI_INLINE_COMPLETION_ENABLE]: {
            title: AI_CORE_PREFERENCES_TITLE,
            type: 'boolean',
            description: 'Enable AI completions inline within any (Monaco) editor.',
            default: false
        }
    }
};
