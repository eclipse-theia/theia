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
import { nls } from '@theia/core';

export const PREF_AI_INLINE_COMPLETION_AUTOMATIC_ENABLE = 'ai-features.codeCompletion.automaticCodeCompletion';
export const PREF_AI_INLINE_COMPLETION_DEBOUNCE_DELAY = 'ai-features.codeCompletion.debounceDelay';
export const PREF_AI_INLINE_COMPLETION_EXCLUDED_EXTENSIONS = 'ai-features.codeCompletion.excludedFileExtensions';
export const PREF_AI_INLINE_COMPLETION_MAX_CONTEXT_LINES = 'ai-features.codeCompletion.maxContextLines';
export const PREF_AI_INLINE_COMPLETION_STRIP_BACKTICKS = 'ai-features.codeCompletion.stripBackticks';
export const PREF_AI_INLINE_COMPLETION_CACHE_CAPACITY = 'ai-features.codeCompletion.cacheCapacity';

export const AICodeCompletionPreferencesSchema: PreferenceSchema = {
    type: 'object',
    properties: {
        [PREF_AI_INLINE_COMPLETION_AUTOMATIC_ENABLE]: {
            title: AI_CORE_PREFERENCES_TITLE,
            type: 'boolean',
            description: nls.localize('theia/ai/completion/automaticEnable/description',
                'Automatically trigger AI completions inline within any (Monaco) editor while editing.\
            \n\
            Alternatively, you can manually trigger the code via the command "Trigger Inline Suggestion" or the default shortcut "Ctrl+Alt+Space".'),
            default: false
        },
        [PREF_AI_INLINE_COMPLETION_DEBOUNCE_DELAY]: {
            title: nls.localize('theia/ai/completion/debounceDelay/title', 'Debounce Delay'),
            type: 'number',
            description: nls.localize('theia/ai/completion/debounceDelay/description',
                'Controls the delay in milliseconds before triggering AI completions after changes have been detected in the editor.\
                Requires `Automatic Code Completion` to be enabled. Enter 0 to disable the debounce delay.'),
            default: 300
        },
        [PREF_AI_INLINE_COMPLETION_EXCLUDED_EXTENSIONS]: {
            title: nls.localize('theia/ai/completion/excludedFileExts/title', 'Excluded File Extensions'),
            type: 'array',
            description: nls.localize('theia/ai/completion/excludedFileExts/description', 'Specify file extensions (e.g., .md, .txt) where AI completions should be disabled.'),
            items: {
                type: 'string'
            },
            default: []
        },
        [PREF_AI_INLINE_COMPLETION_MAX_CONTEXT_LINES]: {
            title: nls.localize('theia/ai/completion/maxContextLines/title', 'Maximum Context Lines'),
            type: 'number',
            description: nls.localize('theia/ai/completion/maxContextLines/description',
                'The maximum number of lines used as context, distributed among the lines before and after the cursor position (prefix and suffix).\
            Set this to -1 to use the full file as context without any line limit and 0 to only use the current line.'),
            default: -1,
            minimum: -1
        },
        [PREF_AI_INLINE_COMPLETION_STRIP_BACKTICKS]: {
            title: nls.localize('theia/ai/completion/stripBackticks/title', 'Strip Backticks from Inline Completions'),
            type: 'boolean',
            description: nls.localize('theia/ai/completion/stripBackticks/description',
                'Remove surrounding backticks from the code returned by some LLMs. If a backtick is detected, all content after the closing\
             backtick is stripped as well. This setting helps ensure plain code is returned when language models use markdown-like formatting.'),
            default: true
        },
        [PREF_AI_INLINE_COMPLETION_CACHE_CAPACITY]: {
            title: nls.localize('theia/ai/completion/cacheCapacity/title', 'Code Completion Cache Capacity'),
            type: 'number',
            description: nls.localize('theia/ai/completion/cacheCapacity/description',
                'Maximum number of code completions to store in the cache. A higher number can improve performance but will consume more memory.\
                Minimum value is 10, recommended range is between 50-200.'),
            default: 100,
            minimum: 10
        }
    }
};
