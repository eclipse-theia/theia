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
import { Terminal, TerminalOptions } from "@theia/plugin";
import { TerminalServiceExt, TerminalServiceMain, PLUGIN_RPC_CONTEXT } from "../api/plugin-api";
import { RPCProtocol } from "../api/rpc-protocol";
import { Emitter } from "@theia/core/lib/common/event";
import * as theia from '@theia/plugin';

/**
 * Provides high level terminal plugin api to use in the Theia plugins.
 * This service allow(with help proxy) create and use terminal emulator.
 */
export class TerminalServiceExtImpl implements TerminalServiceExt {

    private readonly proxy: TerminalServiceMain;
    private readonly terminals: Map<number, Terminal> = new Map();
    private readonly onDidCloseTerminalEmitter = new Emitter<Terminal>();

    constructor(rpc: RPCProtocol) {
        this.proxy = rpc.getProxy(PLUGIN_RPC_CONTEXT.TERMINAL_MAIN);
    }

    createTerminal(nameOrOptions: TerminalOptions | (string | undefined), shellPath?: string, shellArgs?: string[]): Terminal {
        let options: TerminalOptions;
        if (typeof nameOrOptions === "object") {
            options = nameOrOptions;
        } else {
            options = {
                name: nameOrOptions,
                shellPath: shellPath,
                shellArgs: shellArgs
            };
        }

        const terminal = new TerminalExtImpl(this.proxy, options.name || "Terminal");
        terminal.create(options, shellPath, shellArgs);
        terminal.processId.then(id => {
            this.terminals.set(id, terminal);
        });
        return terminal;
    }

    $terminalClosed(id: number): void {
        const terminal = this.terminals.get(id);
        if (terminal) {
            this.onDidCloseTerminalEmitter.fire(terminal);
        }
    }

    public set onDidCloseTerminal(event: theia.Event<Terminal>) {
        this.onDidCloseTerminalEmitter.event.apply(event);
    }

    public get onDidCloseTerminal(): theia.Event<Terminal> {
        return this.onDidCloseTerminalEmitter.event;
    }
}

export class TerminalExtImpl implements Terminal {

    termProcessId: PromiseLike<number>;

    constructor(private readonly proxy: TerminalServiceMain, readonly name: string) { }

    create(nameOrOptions: TerminalOptions, shellPath?: string, shellArgs?: string[]): void {
        this.termProcessId = this.proxy.$createTerminal(nameOrOptions);
    }

    sendText(text: string, addNewLine?: boolean): void {
        this.termProcessId.then(id => this.proxy.$sendText(id, text, addNewLine));
    }

    show(preserveFocus?: boolean): void {
        this.termProcessId.then(id => this.proxy.$show(id));
    }

    hide(): void {
        this.termProcessId.then(id => this.proxy.$hide(id));
    }

    dispose(): void {
        this.termProcessId.then(id => this.proxy.$dispose(id));
    }

    public get processId(): Thenable<number> {
        return this.termProcessId;
    }
}
