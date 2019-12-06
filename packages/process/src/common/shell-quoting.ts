/********************************************************************************
 * Copyright (C) 2020 Ericsson and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

// #region vscode

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// See: https://github.com/microsoft/vscode/blob/9ebb7c43bc99fd6e1a295040674d1f8e5831b9be/src/vs/vscode.d.ts#L5326-L5370

/**
 * Defines how an argument should be quoted if it contains
 * spaces or unsupported characters.
 */
export const enum ShellQuoting {

    /**
     * Character escaping should be used. This for example
     * uses \ on bash and ` on PowerShell.
     */
    Escape = 'escape',

    /**
     * Strong string quoting should be used. This for example
     * uses " for Windows cmd and ' for bash and PowerShell.
     * Strong quoting treats arguments as literal strings.
     * Under PowerShell echo 'The value is $(2 * 3)' will
     * print `The value is $(2 * 3)`
     */
    Strong = 'strong',

    /**
     * Weak string quoting should be used. This for example
     * uses " for Windows cmd, bash and PowerShell. Weak quoting
     * still performs some kind of evaluation inside the quoted
     * string.  Under PowerShell echo "The value is $(2 * 3)"
     * will print `The value is 6`
     */
    Weak = 'weak'
}

/**
 * A string that will be quoted depending on the used shell.
 */
export interface ShellQuotedString {
    /**
     * The actual string value.
     */
    value: string;

    /**
     * The quoting style to use.
     */
    quoting: ShellQuoting;
}

// #endregion vscode

/**
 * Functions that provide shell quoting capabilities.
 */
export interface ShellQuotingFunctions {

    characters: {
        /** Characters that require quotes, white space is always implied. */
        needQuotes?: string
        /** The character used to escape sequences. */
        escape?: string
        /** The character used to quote sequences, preventing variable expansion. */
        strong?: string
        /** The character used to quote sequences, allowing variable expansion. */
        weak?: string
    }

    /**
     * Should add escape-characters in front of forbidden characters.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    escape?(this: any, arg: string): string

    /**
     * Should quote the argument in such a way that variables CANNOT be expanded.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    strong?(this: any, arg: string): string;

    /**
     * Should quote the argument in such a way that variables CAN be expanded.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    weak?(this: any, arg: string): string;
}

/**
 * Converts a list of args into an escaped shell command.
 *
 * There are two main use cases when handling command/arguments for a shell:
 * 1. User already wrote the escaped commandline, then just use that.
 * 2. User wants a specific process to be invoked with some arguments.
 *
 * The `createShellCommandLine` function is useful for the latter.
 *
 * @param args Standard list of spawn/exec arguments, first item is the command.
 * @param quotingFunctions Collection of functions to process arguments.
 */
export function createShellCommandLine(args: Array<string | ShellQuotedString>, quotingFunctions?: ShellQuotingFunctions): string {
    return args.map(arg => escapeForShell(arg, quotingFunctions)).join(' ');
}

/**
 * Escape (or quote) a given input.
 *
 * @param arg Input to escape.
 * @param quotingFunctions Collection of functions to process the given `arg`.
 * @param quotingType Override the quoting type specified by the given `arg`.
 */
export function escapeForShell(arg: string | ShellQuotedString, quotingFunctions?: ShellQuotingFunctions, quotingType?: ShellQuoting): string {
    let value: string;
    let quoting: ShellQuoting | undefined = quotingType;
    if (typeof arg === 'string') {
        if (!quoting) {
            return arg;
        }
        value = arg;
    } else {
        if (!quoting) {
            quoting = arg.quoting;
        }
        value = arg.value;
    }
    if (quotingFunctions && typeof quotingFunctions[quoting] === 'function') {
        return quotingFunctions[quoting]!(value);
    }
    return value;
}

export const BashQuotingFunctions: Required<ShellQuotingFunctions> = {
    characters: {
        needQuotes: '()',
        escape: '\\',
        strong: '\'',
        weak: '"',
    },
    escape(arg): string {
        return arg
            .replace(/[\s\\|(){}<>$&;"']/g, '\\$&');
    },
    strong(arg): string {
        // ('+) becomes ('"'+"')
        return `'${arg
            .replace(/'+/g, '\'"$&"\'')}'`;
    },
    weak(arg): string {
        return `"${arg
            // Escape escape-characters.
            .replace(/\\"/g, '\\\\"')
            // Escape user-specified double-quotes.
            .replace(/"/g, '\\"')
            // Escape trailing (\), we don't want the user to escape our last quote.
            .replace(/\\$/g, '\\\\')}"`;
    },
};

export const CmdQuotingFunctions: Required<ShellQuotingFunctions> = {
    characters: {
        weak: '"',
    },
    escape(arg): string {
        return arg
            // Escape forbidden characters (see: cmd /?).
            .replace(/[%&<>()@^|]/g, '^$&')
            // Some characters must be escaped using `\`.
            .replace(/[\\"]/g, '\\$&')
            // Double-quote whitespaces, else we cannot escape it.
            .replace(/\s+/g, '"$&"');
    },
    strong(arg): string {
        return this.weak(arg)
            // Try to prevent variable expansion.
            .replace(/%/g, '"%"');
    },
    weak(arg): string {
        return `"${arg
            // Escape double quotes.
            .replace(/\\"/g, '\\\\"')
            .replace(/"/g, '\\"')
            // Escape forbidden characters (see: cmd /?)
            .replace(/[&<>()@^|]/g, '^$&')
            // Escape trailing backslash, we don't want the user to escape our last quote.
            .replace(/\\$/g, '\\\\')
            // Escape line returns
            .replace(/\r?\n/g, '^$&')}"`;
    },
};

export const PowershellQuotingFunctions: Required<ShellQuotingFunctions> = {
    characters: {
        needQuotes: '()',
        escape: '`',
        strong: '\'',
        weak: '"',
    },
    escape(arg): string {
        return arg.replace(/[`|{}()<>;"' ]/g, '`$&');
    },
    strong(arg): string {
        // In powershell, one must write ('') for a single quote to be displayed
        // within a single quoted string.
        return `'${arg
            .replace(/'/g, '\'\'')}'`;
    },
    weak(arg): string {
        return `"${arg
            // Escape escape-characters.
            .replace(/`"/g, '``"')
            // Escape user-specified backticks.
            .replace(/"/g, '`"')
            // Escape trailing (`), we don't want the user to escape our last quote.
            .replace(/`$/g, '``')}"`;
    },
};
