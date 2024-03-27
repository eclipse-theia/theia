// *****************************************************************************
// Copyright (C) 2018 Red Hat, Inc. and others.
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

import { Event, ViewColumn } from '@theia/core';
import { BaseWidget } from '@theia/core/lib/browser';
import { MarkdownString } from '@theia/core/lib/common/markdown-rendering/markdown-string';
import { ThemeIcon } from '@theia/core/lib/common/theme';
import { CommandLineOptions } from '@theia/process/lib/common/shell-command-builder';
import { TerminalSearchWidget } from '../search/terminal-search-widget';
import { TerminalProcessInfo, TerminalExitReason } from '../../common/base-terminal-protocol';
import URI from '@theia/core/lib/common/uri';

export interface TerminalDimensions {
    cols: number;
    rows: number;
}

export interface TerminalExitStatus {
    readonly code: number | undefined;
    readonly reason: TerminalExitReason;
}

export type TerminalLocationOptions = TerminalLocation | TerminalEditorLocation | TerminalSplitLocation;

export enum TerminalLocation {
    Panel = 1,
    Editor = 2
}

export interface TerminalEditorLocation {
    readonly viewColumn: ViewColumn;
    readonly preserveFocus?: boolean;
}

export interface TerminalSplitLocation {
    readonly parentTerminal: string;
}

export interface TerminalBuffer {
    readonly length: number;
    /**
     * @param start zero based index of the first line to return
     * @param length the max number or lines to return
     */
    getLines(start: number, length: number): string[];
}

/**
 * Terminal UI widget.
 */
export abstract class TerminalWidget extends BaseWidget {

    abstract processId: Promise<number>;
    /**
     * Get the current executable and arguments.
     */
    abstract processInfo: Promise<TerminalProcessInfo>;

    /** The ids of extensions contributing to the environment of this terminal mapped to the provided description for their changes. */
    abstract envVarCollectionDescriptionsByExtension: Promise<Map<string, (string | MarkdownString | undefined)[]>>;

    /** Terminal kind that indicates whether a terminal is created by a user or by some extension for a user */
    abstract readonly kind: 'user' | string;

    abstract readonly terminalId: number;

    abstract readonly dimensions: TerminalDimensions;

    abstract readonly exitStatus: TerminalExitStatus | undefined;

    /** Terminal widget can be hidden from users until explicitly shown once. */
    abstract readonly hiddenFromUser: boolean;

    /** The position of the terminal widget. */
    abstract readonly location: TerminalLocationOptions;

    /** The last CWD assigned to the terminal, useful when attempting getCwdURI on a task terminal fails */
    lastCwd: URI;

    /**
     * Start terminal and return terminal id.
     * @param id - terminal id.
     */
    abstract start(id?: number): Promise<number>;

    /**
     * Send text to the terminal server.
     * @param text - text content.
     */
    abstract sendText(text: string): void;

    /**
     * Resolves when the command is successfully sent, this doesn't mean that it
     * was evaluated. Might reject if terminal wasn't properly started yet.
     *
     * Note that this method will try to escape your arguments as if it was
     * someone inputting everything in a shell.
     *
     * Supported shells: `bash`, `cmd.exe`, `wsl.exe`, `pwsh/powershell.exe`
     */
    abstract executeCommand(commandOptions: CommandLineOptions): Promise<void>;

    /** Event that fires when the terminal is connected or reconnected */
    abstract onDidOpen: Event<void>;

    /** Event that fires when the terminal fails to connect or reconnect */
    abstract onDidOpenFailure: Event<void>;

    /** Event that fires when the terminal size changed */
    abstract onSizeChanged: Event<{ cols: number; rows: number; }>;

    /** Event that fires when the terminal receives a key event. */
    abstract onKey: Event<{ key: string, domEvent: KeyboardEvent }>;

    /** Event that fires when the terminal input data */
    abstract onData: Event<string>;

    abstract onOutput: Event<string>;

    abstract buffer: TerminalBuffer;

    abstract scrollLineUp(): void;

    abstract scrollLineDown(): void;

    abstract scrollToTop(): void;

    abstract scrollToBottom(): void;

    abstract scrollPageUp(): void;

    abstract scrollPageDown(): void;

    abstract resetTerminal(): void;
    /**
     * Event which fires when terminal did closed. Event value contains closed terminal widget definition.
     */
    abstract onTerminalDidClose: Event<TerminalWidget>;

    /**
     * Cleat terminal output.
     */
    abstract clearOutput(): void;

    /**
     * Select entire content in the terminal.
     */
    abstract selectAll(): void;

    abstract writeLine(line: string): void;

    abstract write(data: string): void;

    abstract resize(cols: number, rows: number): void;

    /**
     * Return Terminal search box widget.
     */
    abstract getSearchBox(): TerminalSearchWidget;
    /**
     * Whether the terminal process has child processes.
     */
    abstract hasChildProcesses(): Promise<boolean>;

    abstract setTitle(title: string): void;

    abstract waitOnExit(waitOnExit?: boolean | string): void;
}

/**
 * Terminal widget options.
 */
export const TerminalWidgetOptions = Symbol('TerminalWidgetOptions');
export interface TerminalWidgetOptions {

    /**
     * Human readable terminal representation on the UI.
     */
    readonly title?: string;

    /**
     * icon class with or without color modifier
     */
    readonly iconClass?: string | ThemeIcon;

    /**
     * Path to the executable shell. For example: `/bin/bash`, `bash`, `sh`.
     */
    readonly shellPath?: string;

    /**
     * Args for the custom shell executable. A string can be used on Windows only which allows
     * specifying shell args in [command-line format](https://msdn.microsoft.com/en-au/08dfcab2-eb6e-49a4-80eb-87d4076c98c6).
     */
    readonly shellArgs?: string[] | string;

    /**
     * Current working directory.
     */
    readonly cwd?: string | URI;

    /**
     * Environment variables for terminal.
     */
    readonly env?: { [key: string]: string | null };

    /**
     * Whether the terminal process environment should be exactly as provided in `env`.
     */
    readonly strictEnv?: boolean;

    /**
     * In case `destroyTermOnClose` is true - terminal process will be destroyed on close terminal widget, otherwise will be kept
     * alive.
     */
    readonly destroyTermOnClose?: boolean;

    /**
     * Terminal server side can send to the client `terminal title` to display this value on the UI. If
     * useServerTitle = true then display this title, otherwise display title defined by 'title' argument.
     */
    readonly useServerTitle?: boolean;

    /**
     * Whether it is a pseudo terminal where an extension controls its input and output.
     */
    readonly isPseudoTerminal?: boolean;

    /**
     * Terminal id. Should be unique for all DOM.
     */
    readonly id?: string;

    /**
     * Terminal attributes. Can be useful to apply some implementation specific information.
     */
    readonly attributes?: { [key: string]: string | null };

    /**
     * Terminal kind that indicates whether a terminal is created by a user or by some extension for a user
     */
    readonly kind?: 'user' | string;

    /**
     * When enabled the terminal will run the process as normal but not be surfaced to the user until `Terminal.show` is called.
     */
    readonly hideFromUser?: boolean;

    readonly location?: TerminalLocationOptions;

    /**
     * When enabled, the terminal will not be persisted across window reloads.
     */
    readonly isTransient?: boolean;
}
