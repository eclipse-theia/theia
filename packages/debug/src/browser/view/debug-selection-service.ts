/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

import { injectable, inject, postConstruct } from 'inversify';
import { DebugProtocol } from 'vscode-debugprotocol';
import { DebugSessionManager } from '../debug-session';
import { Emitter, Event } from "@theia/core";
import { ExtDebugProtocol } from '../../common/debug-common';

/**
 * Contains debug panel selections.
 */
@injectable()
export class DebugSelection {
    private _thread: DebugProtocol.Thread | undefined;
    private _frame: DebugProtocol.StackFrame | undefined;
    private _variable: ExtDebugProtocol.Variable | undefined;

    private readonly onDidSelectThreadEmitter = new Emitter<DebugProtocol.Thread | undefined>();
    private readonly onDidSelectFrameEmitter = new Emitter<DebugProtocol.StackFrame | undefined>();
    private readonly onDidSelectVariableEmitter = new Emitter<ExtDebugProtocol.Variable | undefined>();

    get thread(): DebugProtocol.Thread | undefined {
        return this._thread;
    }

    set thread(thread: DebugProtocol.Thread | undefined) {
        this._thread = thread;
        this.onDidSelectThreadEmitter.fire(thread);
    }

    get frame(): DebugProtocol.StackFrame | undefined {
        return this._frame;
    }

    set frame(frame: DebugProtocol.StackFrame | undefined) {
        this._frame = frame;
        this.onDidSelectFrameEmitter.fire(frame);
    }

    get variable(): ExtDebugProtocol.Variable | undefined {
        return this._variable;
    }

    set variable(variable: ExtDebugProtocol.Variable | undefined) {
        this._variable = variable;
        this.onDidSelectVariableEmitter.fire(variable);
    }

    get onDidSelectThread(): Event<DebugProtocol.Thread | undefined> {
        return this.onDidSelectThreadEmitter.event;
    }

    get onDidSelectFrame(): Event<DebugProtocol.StackFrame | undefined> {
        return this.onDidSelectFrameEmitter.event;
    }

    get onDidSelectVariable(): Event<ExtDebugProtocol.Variable | undefined> {
        return this.onDidSelectVariableEmitter.event;
    }
}

@injectable()
export class DebugSelectionService {
    private readonly selections = new Map<string, DebugSelection>();

    constructor(
        @inject(DebugSessionManager) protected readonly debugSessionManager: DebugSessionManager) { }

    @postConstruct()
    protected init() {
        this.debugSessionManager.onDidPreCreateDebugSession(sessionId => this.selections.set(sessionId, new DebugSelection()));
        this.debugSessionManager.onDidDestroyDebugSession(debugSession => this.selections.delete(debugSession.sessionId));
    }

    get(sessionId: string): DebugSelection {
        const selection = this.selections.get(sessionId);
        if (!selection) {
            throw new Error(`Selection is not initialized for the debug session: '${sessionId}'`);
        }

        return selection;
    }
}
