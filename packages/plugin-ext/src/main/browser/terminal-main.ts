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

import { TerminalOptions } from "@theia/plugin";
import { TerminalServiceMain, TerminalServiceExt, MAIN_RPC_CONTEXT } from "../../api/plugin-api";
import { interfaces } from "inversify";
import { TerminalService } from "@theia/terminal/lib/browser/base/terminal-service";
import { TerminalWidget, TerminalWidgetOptions } from "@theia/terminal/lib/browser/base/terminal-widget";
import { RPCProtocol } from "../../api/rpc-protocol";
import { ApplicationShell } from "@theia/core/lib/browser";

/**
 * Plugin api service allows working with terminal emulator.
 */
export class TerminalServiceMainImpl implements TerminalServiceMain {

    private readonly terminalService: TerminalService;
    private readonly shell: ApplicationShell;
    protected readonly terminals = new Map<number, TerminalWidget>();
    private readonly extProxy: TerminalServiceExt;
    private terminalNumber = 0;
    private readonly TERM_ID_PREFIX = "plugin-terminal-";

    constructor(container: interfaces.Container, rpc: RPCProtocol) {
        this.terminalService = container.get(TerminalService);
        this.shell = container.get(ApplicationShell);
        this.extProxy = rpc.getProxy(MAIN_RPC_CONTEXT.TERMINAL_EXT);
    }

    async $createTerminal(options: TerminalOptions): Promise<number> {
        const counter = this.terminalNumber++;
        const termWidgetOptions: TerminalWidgetOptions = {
            title: options.name,
            shellPath: options.shellPath,
            shellArgs: options.shellArgs,
            cwd: options.cwd,
            env: options.env,
            destroyTermOnClose: true,
            useServerTitle: false,
            id: this.TERM_ID_PREFIX + counter
        };
        let id: number;
        try {
            const termWidget = await this.terminalService.newTerminal(termWidgetOptions);
            id = await termWidget.start();
            this.terminals.set(id, termWidget);
            termWidget.onTerminalDidClose(() => {
                this.extProxy.$terminalClosed(id);
            });
        } catch (error) {
            throw new Error("Failed to create terminal. Cause: " + error);
        }
        return id;
    }

    $sendText(id: number, text: string, addNewLine?: boolean): void {
        const termWidget = this.terminals.get(id);
        if (termWidget) {
            text = text.replace(/\r?\n/g, '\r');
            if (addNewLine && text.charAt(text.length - 1) !== '\r') {
                text += '\r';
            }
            termWidget.sendText(text);
        }
    }

    $show(id: number, preserveFocus?: boolean): void {
        const termWidget = this.terminals.get(id);
        if (termWidget) {
            this.terminalService.activateTerminal(termWidget);
        }
    }

    $hide(id: number): void {
        const termWidget = this.terminals.get(id);
        if (termWidget) {
            if (termWidget.isVisible) {
                const area = this.shell.getAreaFor(termWidget);
                if (area) {
                    this.shell.collapsePanel(area);
                }
            }
        }
    }

    $dispose(id: number): void {
        const termWidget = this.terminals.get(id);
        if (termWidget) {
            termWidget.dispose();
        }
    }
}
