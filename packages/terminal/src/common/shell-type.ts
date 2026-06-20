// *****************************************************************************
// Copyright (C) 2025 STMicroelectronics and others.
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

import { OS } from '@theia/core';
import * as path from 'path';

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// code copied and modified from https://github.com/microsoft/vscode/blob/1.99.0/src/vs/platform/terminal/common/terminal.ts#L135-L155

export const enum GeneralShellType {
    Bash = 'bash',
    Csh = 'csh',
    Fish = 'fish',
    Julia = 'julia',
    Ksh = 'ksh',
    Node = 'node',
    NuShell = 'nu',
    PowerShell = 'pwsh',
    Python = 'python',
    Sh = 'sh',
    Zsh = 'zsh',
}

export const enum WindowsShellType {
    CommandPrompt = 'cmd',
    GitBash = 'gitbash',
    Wsl = 'wsl'
}

export type ShellType = GeneralShellType | WindowsShellType;

export const windowShellTypesToRegex: Map<string, RegExp> = new Map([
    [WindowsShellType.CommandPrompt, /^cmd$/],
    [WindowsShellType.GitBash, /^bash$/],
    [WindowsShellType.Wsl, /^wsl$/]
]);

export const shellTypesToRegex: Map<string, RegExp> = new Map([
    [GeneralShellType.Bash, /^bash$/],
    [GeneralShellType.Csh, /^csh$/],
    [GeneralShellType.Fish, /^fish$/],
    [GeneralShellType.Julia, /^julia$/],
    [GeneralShellType.Ksh, /^ksh$/],
    [GeneralShellType.Node, /^node$/],
    [GeneralShellType.NuShell, /^nu$/],
    [GeneralShellType.PowerShell, /^pwsh(-preview)?|powershell$/],
    [GeneralShellType.Python, /^py(?:thon)?(?:\d+)?$/],
    [GeneralShellType.Sh, /^sh$/],
    [GeneralShellType.Zsh, /^zsh$/]
]);

const shellPrefixPatterns = [
    /^noglob\s+/,
    /^nocorrect\s+/,
    /^command\s+/,
    /^builtin\s+/,
    /^exec\s+/,
];

/** Matches `user@host:` style prompts (e.g. `user@host:~/path`). */
export function looksLikeHostPrompt(value: string): boolean {
    return /^[^@\s]+@[^:\s]+:/.test(value);
}

/** Checks whether a single token looks like a file-system path (starts with `/`, `~`, or `./`). */
export function looksLikePath(value: string): boolean {
    return /^[/~]|^\.\//.test(value);
}

/**
 * Cleans a shell-reported terminal title by stripping shell prefixes and
 * extracting the base command name. Returns an empty string for CWD/prompt-style
 * titles (e.g. `/home/user/project`, `user@host:~/path`) to signal that the
 * title should not be updated.
 */
export function cleanTerminalTitle(title: string): string {
    let cleaned = title.trim();
    let changed = true;
    while (changed) {
        changed = false;
        for (const pattern of shellPrefixPatterns) {
            const result = cleaned.replace(pattern, '');
            if (result !== cleaned) {
                cleaned = result;
                changed = true;
            }
        }
    }
    // user@host:path is always a CWD/prompt, skip the update
    if (looksLikeHostPrompt(cleaned)) {
        return '';
    }
    const parts = cleaned.split(/\s+/);
    // A single path-like token (no arguments) is likely a CWD, skip the update
    if (parts.length <= 1 && looksLikePath(cleaned)) {
        return '';
    }
    const command = parts[0];
    const baseName = command.includes('/') ? command.substring(command.lastIndexOf('/') + 1) : command;
    return baseName || title;
}

export function guessShellTypeFromExecutable(executable: string | undefined): string | undefined {
    if (!executable) {
        return undefined;
    }

    if (OS.backend.isWindows) {
        const windowsExecutableName = path.basename(executable, '.exe');
        for (const [shellType, pattern] of windowShellTypesToRegex) {
            if (windowsExecutableName.match(pattern)) {
                return shellType;
            }
        }
        // check also for generic ones as python
        for (const [shellType, pattern] of shellTypesToRegex) {
            if (windowsExecutableName.match(pattern)) {
                return shellType;
            }
        }
    }

    const executableName = path.basename(executable);
    for (const [shellType, pattern] of shellTypesToRegex) {
        if (executableName.match(pattern)) {
            return shellType;
        }
    }
    return undefined;
}
