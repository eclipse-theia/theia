// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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

export const CLAUDE_CODE_EXECUTABLE_PATH_PREF = 'ai-features.claudeCode.executablePath';
export const CLAUDE_CODE_API_KEY_PREF = 'ai-features.claudeCode.apiKey';

export const ClaudeCodePreferencesSchema: PreferenceSchema = {
    properties: {
        [CLAUDE_CODE_EXECUTABLE_PATH_PREF]: {
            type: 'string',
            markdownDescription: nls.localize('theia/ai/claude-code/executablePath/description',
                'Path to the Claude Code executable (cli.js) of the `@anthropic-ai/claude-agent-sdk`.' +
                'If not specified, the system will attempt to resolve the path automatically ' +
                'from the global npm installation.'),
            title: AI_CORE_PREFERENCES_TITLE,
        },
        [CLAUDE_CODE_API_KEY_PREF]: {
            type: 'string',
            markdownDescription: nls.localize('theia/ai/claude-code/apiKey/description',
                'Enter an API Key for Claude Code. **Please note:** By using this preference the API key will be stored in clear text ' +
                'on the machine running Theia. Use the environment variable `ANTHROPIC_API_KEY` to set the key securely.'),
            title: AI_CORE_PREFERENCES_TITLE,
        },
    }
};
