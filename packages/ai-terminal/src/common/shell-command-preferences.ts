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

export const SHELL_COMMAND_ALLOWLIST_PREFERENCE = 'ai-features.terminal.shellCommandAllowlist';
export const SHELL_COMMAND_DENYLIST_PREFERENCE = 'ai-features.terminal.shellCommandDenylist';

export const shellCommandPreferences: PreferenceSchema = {
    properties: {
        [SHELL_COMMAND_ALLOWLIST_PREFERENCE]: {
            type: 'array',
            items: { type: 'string' },
            default: [],
            description: nls.localize(
                'theia/ai-terminal/shellCommandAllowlist/description',
                'List of shell command patterns. Use * as wildcard: "git log" (exact match), ' +
                '"git log *" (with optional arguments), "* --version" (any command ending with --version). ' +
                'Wildcard must be preceded by space. Commands with dangerous patterns ($, backticks) are never auto-allowed.'
            ),
            title: AI_CORE_PREFERENCES_TITLE,
        },
        [SHELL_COMMAND_DENYLIST_PREFERENCE]: {
            type: 'array',
            items: { type: 'string' },
            default: [
                // Shell execution control — these commands can execute arbitrary code,
                // bypass static analysis, or alter the shell's execution environment
                'eval *',
                'exec *',
                'source *',
                '. *',
                'trap *',
                // Indirect execution — can bypass denylist pattern matching
                // e.g., "command eval ..." or "env sudo ..."
                'command *',
                'builtin *',
                'env *',
                // Privilege escalation
                'sudo *',
                'su *',
                // Destructive operations
                'rm -rf /',
                'mkfs *',
                'dd *',
                // System control
                'shutdown *',
                'reboot *',
                'halt *',
                'poweroff *',
                // Command wrappers — execute their arguments as commands
                'xargs *',
                'nohup *',
                'timeout *',
                'nice *',
                // Remote/repeated execution
                'ssh *',
                'watch *',
                // Shell re-invocation
                'bash -c *',
                'sh -c *',
                'zsh -c *',
                'dash -c *',
                'ksh -c *',
                // Interpreter execution
                'python -c *',
                'python3 -c *',
                'node -e *',
                'perl -e *',
                'ruby -e *',
            ],
            description: nls.localize(
                'theia/ai-terminal/shellCommandDenylist/description',
                'List of shell command patterns that should always be denied. Commands matching these patterns will be auto-rejected without confirmation. ' +
                'Uses pattern syntax: "git push" (exact match) or "git push *" (with any arguments). ' +
                'Ships with default patterns for dangerous commands (eval, exec, sudo, rm -rf, etc.).'
            ),
            title: AI_CORE_PREFERENCES_TITLE,
        }
    }
};
