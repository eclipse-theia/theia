/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable } from "inversify";
import { Disposable, ILogger } from '@theia/core/lib/common';
import { Widget, BaseWidget, Message, WebSocketConnectionProvider, Endpoint } from '@theia/core/lib/browser';
import { WorkspaceService } from "@theia/workspace/lib/browser";
import { IShellTerminalServer } from '../common/shell-terminal-protocol';
import { ITerminalServer } from '../common/terminal-protocol';
import { IBaseTerminalErrorEvent, IBaseTerminalExitEvent } from '../common/base-terminal-protocol';
import { TerminalWatcher } from '../common/terminal-watcher';
import * as Xterm from 'xterm';
import 'xterm/lib/addons/fit/fit';
import 'xterm/lib/addons/attach/attach';

export const TERMINAL_WIDGET_FACTORY_ID = 'terminal';

export const TerminalWidgetOptions = Symbol("TerminalWidgetOptions");
export interface TerminalWidgetOptions {
    endpoint: Endpoint.Options,
    id: string,
    caption: string,
    label: string
    destroyTermOnClose: boolean
}

export interface TerminalWidgetFactoryOptions extends Partial<TerminalWidgetOptions> {
    /* a unique string per terminal */
    created: string
}

@injectable()
export class TerminalWidget extends BaseWidget {

    private terminalId: number | undefined
    private term: Xterm
    private cols: number = 80
    private rows: number = 40
    private endpoint: Endpoint

    constructor(
        @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService,
        @inject(WebSocketConnectionProvider) protected readonly webSocketConnectionProvider: WebSocketConnectionProvider,
        @inject(TerminalWidgetOptions) options: TerminalWidgetOptions,
        @inject(IShellTerminalServer) protected readonly shellTerminalServer: ITerminalServer,
        @inject(TerminalWatcher) protected readonly terminalWatcher: TerminalWatcher,
        @inject(ILogger) protected readonly logger: ILogger
    ) {
        super();
        this.endpoint = new Endpoint(options.endpoint);
        this.id = options.id;
        this.title.caption = options.caption;
        this.title.label = options.label;
        this.title.iconClass = "fa fa-terminal";

        if (options.destroyTermOnClose === true) {
            this.toDispose.push(Disposable.create(() =>
                this.term.destroy()
            ));
        }

        this.title.closable = true
        this.addClass("terminal-container")

        this.term = new Xterm({
            cursorBlink: true,
            theme: 'dark'
        });

        this.term.open(this.node);
        this.term.on('title', (title: string) => {
            this.title.label = title;
        });
    }

    protected registerResize(): void {
        const initialGeometry = (this.term as any).proposeGeometry()
        this.cols = initialGeometry.cols;
        this.rows = initialGeometry.rows;

        this.term.on('resize', size => {
            if (this.terminalId === undefined) {
                return;
            }
            this.cols = size.cols;
            this.rows = size.rows;
            this.shellTerminalServer.resize(this.terminalId, this.cols, this.rows);
        });
        (this.term as any).fit();
    }

    public async start(): Promise<void> {
        this.registerResize();
        const root = await this.workspaceService.root;
        this.terminalId = await this.shellTerminalServer.create(
            { rootURI: root.uri, cols: this.cols, rows: this.rows });

        /* An error has occurred in the backend.  */
        if (this.terminalId === -1) {
            this.terminalId = undefined;
            this.logger.error("Error creating terminal widget, see the backend error log for more information.  ");
            return;
        }

        this.terminalWatcher.onTerminalError((event: IBaseTerminalErrorEvent) => {
            if (event.terminalId === this.terminalId) {
                this.title.label = "<terminal error>";
            }
        });

        this.terminalWatcher.onTerminalExit((event: IBaseTerminalExitEvent) => {
            if (event.terminalId === this.terminalId) {
                this.title.label = "<terminated>";
            }
        });

        const socket = this.createWebSocket(this.terminalId.toString());
        socket.onopen = () => {
            (this.term as any).attach(socket);
            (this.term as any)._initialized = true;
        };
        socket.onclose = () => {
            this.title.label = `<terminated>`;
        };
        socket.onerror = (err) => {
            console.error(err);
        };
        this.toDispose.push(Disposable.create(() =>
            socket.close()
        ));
    }

    protected createWebSocket(pid: string): WebSocket {
        const url = this.endpoint.getWebSocketUrl().resolve(pid)
        return this.webSocketConnectionProvider.createWebSocket(url.toString(), { reconnecting: false })
    }

    protected onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg)
        this.term.focus()
    }

    private resizeTimer: any

    protected onResize(msg: Widget.ResizeMessage): void {
        super.onResize(msg);
        clearTimeout(this.resizeTimer)
        this.resizeTimer = setTimeout(() => {
            this.doResize()
        }, 500)
    }

    private doResize() {
        const geo = (this.term as any).proposeGeometry()
        this.cols = geo.cols
        this.rows = geo.rows - 1 // subtract one row for margin
        this.term.resize(this.cols, this.rows)
    }
}
