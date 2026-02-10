// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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

import { DisposableCollection, Event, ILogger, Disposable } from '@theia/core';
import { TerminalBlock, TerminalCommandHistoryState } from './base/terminal-widget';
import { Emitter } from '@theia/core/shared/vscode-languageserver-protocol';
import { TerminalPreferences } from '../common/terminal-preferences';

export class TerminalCommandHistoryStateImpl implements TerminalCommandHistoryState, Disposable {
    private _commandHistory: TerminalBlock[] = [];
    get commandHistory(): TerminalBlock[] { return this._commandHistory; }

    private _currentCommand: string = '';
    get currentCommand(): string { return this._currentCommand; }

    private _commandOutputChunks: string[] = [];
    get commandOutputChunks(): string[] { return this._commandOutputChunks; }

    private readonly toDispose = new DisposableCollection();
    private readonly onCommandStartEmitter = new Emitter<void>();
    private readonly onPromptShownEmitter = new Emitter<void>();
    readonly onTerminalCommandStart: Event<void> = this.onCommandStartEmitter.event;
    readonly onTerminalPromptShown: Event<void> = this.onPromptShownEmitter.event;

    enableCommandHistory: boolean = false;
    enableCommandSeparator: boolean = false;

    constructor(
        protected readonly logger: ILogger,
        protected readonly preferences: TerminalPreferences
    ) {
        this.toDispose.push(this.onCommandStartEmitter);
        this.toDispose.push(this.onPromptShownEmitter);

        this.enableCommandHistory = this.preferences.get('terminal.integrated.enableCommandHistory', false);
        this.enableCommandSeparator = this.enableCommandHistory
            ? this.preferences.get('terminal.integrated.enableCommandSeparator', false)
            : false;
    }

    clearCommandCollectionState(): void {
        this._currentCommand = '';
        this._commandOutputChunks = [];
    }

    clearCommandOutputBuffer(): void {
        this._commandOutputChunks = [];
    }

    accumulateCommandOutput(data: string): void {
        this._commandOutputChunks.push(data);
    }

    startCommand(encodedCommand: string): void {
        this._currentCommand = this.decodeHexString(encodedCommand);
        this.onCommandStartEmitter.fire();
    }

    finishCommand(): void {
        if (!this._currentCommand) {
            return;
        }

        const terminalBlock: TerminalBlock = {
            command: this._currentCommand,
            output: this.sanitizeCommandOutput(this._commandOutputChunks.join(''))
        };
        this.logger.debug('Current command history:', this.commandHistory);
        this.logger.debug('Terminal command result captured:', terminalBlock);
        this._commandHistory.push(terminalBlock);
        this.clearCommandCollectionState();
        this.onPromptShownEmitter.fire();
    }

    // Decodes a hex-encoded string to UTF-8 with browser compatible APIs
    private decodeHexString(hexString: string): string {
        if (!hexString) {
            return '';
        }
        const hexBytes = new Uint8Array(
            (hexString.match(/.{1,2}/g) || []).map(byte => parseInt(byte, 16))
        );
        return new TextDecoder('utf-8').decode(hexBytes);
    }

    private sanitizeCommandOutput(output: string): string {
        // remove prompt from the end of the output
        const indexOfPrompt = output.lastIndexOf('\u001b]133;prompt_started');
        if (indexOfPrompt !== -1) {
            output = output.slice(0, indexOfPrompt);
        }
        // remove Operation System Command Blocks (OSC) sequences
        output = output.replace(/\u001b\].*?(?:\u0007|\u001b\\)/gs, '');
        // remove control sequence introducer (CSI) sequences
        output = output.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/gu, '');
        // remove single-character escape sequences
        output = output.replace(/\u001b[>=]/g, '');
        // trim trailing whitespace
        output = output.replace(/\r/g, '');
        return output.trimEnd();
    }

    dispose(): void {
        this._commandHistory = [];
        this._commandOutputChunks = [];
        this.toDispose.dispose();
    }

}
