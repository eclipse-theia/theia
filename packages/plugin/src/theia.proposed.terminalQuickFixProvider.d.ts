// *****************************************************************************
// Copyright (C) 2023 Ericsson and others.
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

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// code copied and modified from https://github.com/microsoft/vscode/blob/1.77.0/src/vscode-dts/vscode.proposed.terminalQuickFixProvider.d.ts

export module '@theia/plugin' {

    export type SingleOrMany<T> = T[] | T;

    export namespace window {
        /**
         * @param provider A terminal quick fix provider
         * @return A {@link Disposable} that un-registers the provider when being disposed
         */
        export function registerTerminalQuickFixProvider(id: string, provider: TerminalQuickFixProvider): Disposable;
    }

    export interface TerminalQuickFixProvider {
        /**
         * Provides terminal quick fixes
         * @param commandMatchResult The command match result for which to provide quick fixes
         * @param token A cancellation token indicating the result is no longer needed
         * @return Terminal quick fix(es) if any
         */
        provideTerminalQuickFixes(commandMatchResult: TerminalCommandMatchResult, token: CancellationToken):
            ProviderResult<SingleOrMany<TerminalQuickFixTerminalCommand | TerminalQuickFixOpener | Command>>;
    }

    export interface TerminalCommandMatchResult {
        commandLine: string;
        commandLineMatch: RegExpMatchArray;
        outputMatch?: {
            regexMatch: RegExpMatchArray;
            outputLines?: string[];
        };
    }

    export class TerminalQuickFixTerminalCommand {
        /**
         * The terminal command to insert or run
         */
        terminalCommand: string;
        /**
         * Whether the command should be executed or just inserted (default)
         */
        shouldExecute?: boolean;
        constructor(terminalCommand: string, shouldExecute?: boolean);
    }
    export class TerminalQuickFixOpener {
        /**
         * The uri to open
         */
        uri: Uri;
        constructor(uri: Uri);
    }

    /**
     * A matcher that runs on a sub-section of a terminal command's output
     */
    interface TerminalOutputMatcher {
        /**
         * A string or regex to match against the unwrapped line. If this is a regex with the multiline
         * flag, it will scan an amount of lines equal to `\n` instances in the regex + 1.
         */
        lineMatcher: string | RegExp;
        /**
         * Which side of the output to anchor the {@link offset} and {@link length} against.
         */
        anchor: TerminalOutputAnchor;
        /**
         * The number of rows above or below the {@link anchor} to start matching against.
         */
        offset: number;
        /**
         * The number of wrapped lines to match against, this should be as small as possible for performance
         * reasons. This is capped at 40.
         */
        length: number;
    }

    enum TerminalOutputAnchor {
        Top = 0,
        Bottom = 1
    }

}
