/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable } from "inversify";
import { Disposable, ILogger } from '@theia/core/lib/common';
import { Widget, BaseWidget, Message, WebSocketConnectionProvider, Endpoint, StatefulWidget } from '@theia/core/lib/browser';
import { WorkspaceService } from "@theia/workspace/lib/browser";
import { IShellTerminalServer } from '../common/shell-terminal-protocol';
import { ITerminalServer } from '../common/terminal-protocol';
import { IBaseTerminalErrorEvent, IBaseTerminalExitEvent } from '../common/base-terminal-protocol';
import { TerminalWatcher } from '../common/terminal-watcher';
import * as Xterm from 'xterm';
import { ThemeService } from "@theia/core/lib/browser/theming";

Xterm.Terminal.applyAddon(require('xterm/lib/addons/fit/fit'));
Xterm.Terminal.applyAddon(require('xterm/lib/addons/attach/attach'));

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

interface TerminalCSSProperties {
    /* The font family (e.g. monospace).  */
    fontFamily: string;

    /* The font size, in number of px.  */
    fontSize: number;

    /* The text color, as a CSS color string.  */
    foreground: string;

    /* The background color, as a CSS color string.  */
    background: string;
}

@injectable()
export class TerminalWidget extends BaseWidget implements StatefulWidget {

    private terminalId: number | undefined;
    private term: Xterm.Terminal;
    private cols: number = 80;
    private rows: number = 40;
    private endpoint: Endpoint;
    protected restored = false;
    protected closeOnDispose = true;
    protected waitForStarted: Promise<void>;
    protected started: Function;
    protected openAfterShow = false;
    protected isOpeningTerm = false;
    protected isTermOpen = false;

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

        this.waitForStarted = new Promise(resolve => {
            this.started = resolve;
        });

        if (options.destroyTermOnClose === true) {
            this.toDispose.push(Disposable.create(() =>
                this.term.destroy()
            ));
        }

        this.title.closable = true;
        this.addClass("terminal-container");

        /* Read CSS properties from the page and apply them to the terminal.  */
        const cssProps = this.getCSSPropertiesFromPage();

        this.term = new Xterm.Terminal({
            cursorBlink: true,
            fontFamily: cssProps.fontFamily,
            fontSize: cssProps.fontSize,
            theme: {
                foreground: cssProps.foreground,
                background: cssProps.background,
                cursor: cssProps.foreground
            },
        });

        this.toDispose.push(ThemeService.get().onThemeChange(c => {
            const changedProps = this.getCSSPropertiesFromPage();
            this.term.setOption('theme', {
                foreground: changedProps.foreground,
                background: changedProps.background,
                cursor: changedProps.foreground
            });
        }));

        this.term.on('title', (title: string) => {
            this.title.label = title;
        });
    }

    storeState(): object {
        this.closeOnDispose = false;
        return { terminalId: this.terminalId, titleLabel: this.title.label };
    }

    restoreState(oldState: object) {
        if (this.restored === false) {
            const state = oldState as any;
            /* This is a workaround to issue #879 */
            this.restored = true;
            this.title.label = state.titleLabel;
            this.start(state.terminalId);
        }
    }

    /* Get the font family and size from the CSS custom properties defined in
       the root element.  */

    private getCSSPropertiesFromPage(): TerminalCSSProperties {
        /* Helper to look up a CSS property value and throw an error if it's
           not defined.  */

        function lookup(props: CSSStyleDeclaration, name: string): string {
            /* There is sometimes an extra space in the front, remove it.  */
            const value = htmlElementProps.getPropertyValue(name).trim();
            if (!value) {
                throw new Error(`Couldn\'t find value of ${name}`);
            }

            return value;
        }

        /* Get the CSS properties of <html> (aka :root in css).  */
        const htmlElementProps = getComputedStyle(document.documentElement);

        const fontFamily = lookup(htmlElementProps, '--theia-code-font-family');
        const fontSizeStr = lookup(htmlElementProps, '--theia-code-font-size');
        const foreground = lookup(htmlElementProps, '--theia-ui-font-color1');
        const background = lookup(htmlElementProps, '--theia-layout-color3');

        /* The font size is returned as a string, such as ' 13px').  We want to
           return just the number of px.  */
        const fontSizeMatch = fontSizeStr.trim().match(/^(\d+)px$/);
        if (!fontSizeMatch) {
            throw new Error(`Unexpected format for --theia-code-font-size (${fontSizeStr})`);
        }

        const fontSize = Number.parseInt(fontSizeMatch[1]);

        /* xterm.js expects #XXX of #XXXXXX for colors.  */
        const colorRe = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

        if (!foreground.match(colorRe)) {
            throw new Error(`Unexpected format for --theia-ui-font-color1 (${foreground})`);
        }

        if (!background.match(colorRe)) {
            throw new Error(`Unexpected format for --theia-layout-color3 (${background})`);
        }

        return {
            fontSize: fontSize,
            fontFamily: fontFamily,
            foreground: foreground,
            background: background,
        };
    }

    protected registerResize(): void {
        const initialGeometry = (this.term as any).proposeGeometry();
        this.cols = initialGeometry.cols;
        this.rows = initialGeometry.rows;

        this.term.on('resize', size => {
            if (this.terminalId === undefined) {
                return;
            }

            if (!size) {
                return;
            }

            this.cols = size.cols;
            this.rows = size.rows;
            this.shellTerminalServer.resize(this.terminalId, this.cols, this.rows);
        });
        (this.term as any).fit();
    }

    /**
     * Create a new shell terminal in the back-end and attach it to a
     * new terminal widget.
     * If id is provided attach to the terminal for this id.
     */
    public async start(id?: number): Promise<void> {
        if (id === undefined) {
            const root = await this.workspaceService.root;
            const rootURI = root !== undefined ? root.uri : undefined;
            this.terminalId = await this.shellTerminalServer.create(
                { rootURI, cols: this.cols, rows: this.rows });

        } else {
            this.terminalId = await this.shellTerminalServer.attach(id);
        }

        /* An error has occurred in the backend.  */
        if (this.terminalId === -1 || this.terminalId === undefined) {
            this.terminalId = undefined;
            if (id === undefined) {
                this.logger.error("Error creating terminal widget, see the backend error log for more information.  ");
            } else {
                this.logger.error(`Error attaching to terminal id ${id}, the terminal is most likely gone. Starting up a new terminal instead.  `);
                this.start();
            }
            return;
        }
        this.started();
    }

    protected async openTerm(): Promise<void> {
        this.isOpeningTerm = true;

        if (this.isTermOpen === true) {
            this.isOpeningTerm = false;
            return Promise.reject("Already open");
        }

        /* Wait for the backend terminal to be requested before opening the xterm terminal.  */
        await this.waitForStarted;

        if (this.terminalId === undefined) {
            /* Don't retry to open, something is permanently wrong.  */
            this.isOpeningTerm = false;
            this.isTermOpen = true;
            return Promise.reject("No terminal");
        }

        /* This may have changed since we waited for waitForStarted. Test it again.  */
        if (this.isVisible === false) {
            this.isOpeningTerm = false;
            return Promise.reject("Not visible");
        }

        this.term.open(this.node);
        this.registerResize();
        this.connectSocket(this.terminalId);
        this.monitorTerminal(this.terminalId);

        this.isTermOpen = true;
        return Promise.resolve();
    }
    protected createWebSocket(pid: string): WebSocket {
        const url = this.endpoint.getWebSocketUrl().resolve(pid);
        return this.webSocketConnectionProvider.createWebSocket(url.toString(), { reconnecting: false });
    }

    protected onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        if (this.isTermOpen) {
            this.term.focus();
        }
    }

    protected onAfterShow(msg: Message): void {
        super.onAfterShow(msg);
        if (this.openAfterShow) {
            if (this.isOpeningTerm === false) {
                this.openTerm().then(() => {
                    this.openAfterShow = false;
                    this.term.focus();
                }).catch(e => {
                    this.logger.error("Error opening terminal", e.toString());
                });
            }
        } else {
            this.term.focus();
        }
    }

    protected onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        if (this.isVisible) {
            this.openTerm().then(() => {
                this.term.focus();
            }).catch(e => {
                this.openAfterShow = true;
                this.logger.error("Error opening terminal", e.toString());
            });
        } else {
            this.openAfterShow = true;
        }
    }
    private resizeTimer: any;

    protected onResize(msg: Widget.ResizeMessage): void {
        super.onResize(msg);
        if (this.isTermOpen) {
            clearTimeout(this.resizeTimer);
            this.resizeTimer = setTimeout(() => {
                this.doResize();
            }, 500);
        }
    }

    protected monitorTerminal(id: number) {
        this.toDispose.push(this.terminalWatcher.onTerminalError((event: IBaseTerminalErrorEvent) => {
            if (event.terminalId === id) {
                this.title.label = "<terminal error>";
            }
        }));

        this.toDispose.push(this.terminalWatcher.onTerminalExit((event: IBaseTerminalExitEvent) => {
            if (event.terminalId === id) {
                this.title.label = "<terminated>";
            }
        }));
    }

    protected connectSocket(id: number) {
        const socket = this.createWebSocket(id.toString());
        socket.onopen = () => {
            (this.term as any).attach(socket);
            (this.term as any)._initialized = true;
        };

        socket.onerror = err => {
            console.error(err);
        };
        this.toDispose.push(Disposable.create(() =>
            socket.close()
        ));
    }

    dispose(): void {

        /* Close the backend terminal only when explicitly closting the terminal
         * a refresh for example won't close it.  */
        if (this.closeOnDispose === true && this.terminalId !== undefined) {
            this.shellTerminalServer.close(this.terminalId);
        }

        if (this.resizeTimer !== undefined) {
            clearTimeout(this.resizeTimer);
        }

        super.dispose();
    }

    private doResize() {
        if (this.term === undefined) {
            clearTimeout(this.resizeTimer);
            return;
        }
        const geo = (this.term as any).proposeGeometry();
        this.cols = geo.cols;
        this.rows = geo.rows - 1; // subtract one row for margin
        this.term.resize(this.cols, this.rows);
    }
}
