/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable } from "inversify";
import { Endpoint, Disposable } from '../../application/common';
import { Widget, BaseWidget, Message } from '../../application/browser';
import { WebSocketConnectionProvider } from '../../messaging/browser';
import { WorkspaceService } from "../../workspace/browser";
import * as Xterm from 'xterm';
import 'xterm/lib/addons/fit/fit';
import 'xterm/lib/addons/attach/attach';

let num = 0

export const TerminalWidgetFactory = Symbol('TerminalWidgetFactory');
export interface TerminalWidgetFactory {
    (): TerminalWidget;
}

@injectable()
export class TerminalWidget extends BaseWidget {

    private pid: string | undefined
    private term: Xterm
    private cols: number = 80
    private rows: number = 40
    private endpoint: Endpoint

    constructor(
        @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService,
        @inject(WebSocketConnectionProvider) protected readonly webSocketConnectionProvider: WebSocketConnectionProvider
    ) {
        super();
        this.endpoint = new Endpoint({ path: '/services/terminals' })
        num++
        this.id = 'terminal-' + num
        this.title.caption = 'Terminal ' + num
        this.title.label = 'Terminal ' + num
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
        this.registerResize()
        this.startNewTerminal()

        this.toDispose.push(Disposable.create(() =>
            this.term.destroy()
        ));
    }

    protected registerResize(): void {
        let initialGeometry = (this.term as any).proposeGeometry()
        this.cols = initialGeometry.cols;
        this.rows = initialGeometry.rows;

        this.term.on('resize', size => {
            if (!this.pid) {
                return;
            }
            this.cols = size.cols
            this.rows = size.rows
            let url = this.endpoint.getRestUrl().toString() + "/" + this.pid + '/size?cols=' + this.cols + '&rows=' + this.rows;
            fetch(url, { method: 'POST' })
        });
        (this.term as any).fit()
    }

    protected async startNewTerminal(): Promise<void> {
        const root = await this.workspaceService.root;
        const res = await fetch(this.endpoint.getRestUrl().toString() + '?cols=' + this.cols + '&rows=' + this.rows, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ uri: root.uri })
        });
        this.pid = await res.text();
        const socket = this.createWebSocket(this.pid);
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
        let geo = (this.term as any).proposeGeometry()
        this.cols = geo.cols
        this.rows = geo.rows - 1 // subtract one row for margin
        this.term.resize(this.cols, this.rows)
    }
}