// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

import { nls } from '@theia/core';
import { PreferenceSchema } from '@theia/core/lib/common/preferences';
import { AI_CORE_PREFERENCES_TITLE } from '@theia/ai-core/lib/common/ai-core-preferences';

export const SHELL_COMMAND_WHITELIST_PREFERENCE = 'ai-features.terminal.shellCommandWhitelist';

export const shellCommandPreferences: PreferenceSchema = {
    properties: {
        [SHELL_COMMAND_WHITELIST_PREFERENCE]: {
            type: 'array',
            items: { type: 'string' },
            default: [],
            description: nls.localize(
                'theia/ai-terminal/shellCommandWhitelist/description',
                'List of shell command patterns. Use * as wildcard: "git log" (exact match), ' +
                '"git log *" (with optional arguments), "* --version" (any command ending with --version). ' +
                'Wildcard must be preceded by space. Commands with dangerous patterns ($, backticks) are never auto-allowed.'
            ),
            title: AI_CORE_PREFERENCES_TITLE,
        }
    }
};
