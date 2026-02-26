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

import { DisposableCollection, Event, Disposable } from '@theia/core';
import { TerminalBlock, TerminalCommandHistoryState } from './base/terminal-widget';
import { Emitter } from '@theia/core/shared/vscode-languageserver-protocol';
import { TerminalPreferences } from '../common/terminal-preferences';

export class TerminalCommandHistoryStateImpl implements TerminalCommandHistoryState, Disposable {
    private _commandHistory: TerminalBlock[] = [];
    get commandHistory(): TerminalBlock[] { return this._commandHistory; }

    private _currentCommand: string = '';
    get currentCommand(): string { return this._currentCommand; }

    private readonly toDispose = new DisposableCollection();
    private readonly onCommandStartEmitter = new Emitter<void>();
    private readonly onPromptShownEmitter = new Emitter<void>();
    readonly onTerminalCommandStart: Event<void> = this.onCommandStartEmitter.event;
    readonly onTerminalPromptShown: Event<void> = this.onPromptShownEmitter.event;

    enableCommandHistory: boolean = false;
    enableCommandSeparator: boolean = false;

    constructor(
        protected readonly preferences: TerminalPreferences
    ) {
        this.toDispose.push(this.onCommandStartEmitter);
        this.toDispose.push(this.onPromptShownEmitter);
        this.updateConfig();
    }

    startCommand(command: string): void {
        this._currentCommand = this.decodeHexString(command);
        this.onCommandStartEmitter.fire();
    }

    finishCommand(block: TerminalBlock): void {
        this._commandHistory.push(block);
        this._currentCommand = '';
        this.onPromptShownEmitter.fire();
    }

    clearCommandCollectionState(): void {
        this._currentCommand = '';
    }

    dispose(): void {
        this._commandHistory = [];
        this.toDispose.dispose();
    }

    updateConfig(): void {
        this.enableCommandHistory = this.preferences.get('terminal.integrated.enableCommandHistory', false);
        this.enableCommandSeparator = this.enableCommandHistory
            ? this.preferences.get('terminal.integrated.enableCommandSeparator', false)
            : false;
    }

    /**
     * Decodes a hex-encoded string to UTF-8 using browser-compatible APIs.
     */
    protected decodeHexString(hexString: string): string {
        if (!hexString) {
            return '';
        }
        const hexBytes = new Uint8Array(
            (hexString.match(/.{1,2}/g) || []).map(byte => parseInt(byte, 16))
        );
        return new TextDecoder('utf-8').decode(hexBytes);
    }

}
