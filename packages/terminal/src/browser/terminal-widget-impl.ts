/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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

import * as Xterm from 'xterm';
import { proposeGeometry } from 'xterm/lib/addons/fit/fit';
import { inject, injectable, named, postConstruct } from "inversify";
import { Disposable, Event, Emitter, ILogger, DisposableCollection } from '@theia/core';
import { Widget, Message, WebSocketConnectionProvider, StatefulWidget, isFirefox, MessageLoop } from '@theia/core/lib/browser';
import { WorkspaceService } from "@theia/workspace/lib/browser";
import { ShellTerminalServerProxy } from '../common/shell-terminal-protocol';
import { terminalsPath } from '../common/terminal-protocol';
import { IBaseTerminalServer } from '../common/base-terminal-protocol';
import { TerminalWatcher } from '../common/terminal-watcher';
import { ThemeService } from "@theia/core/lib/browser/theming";
import { TerminalWidgetOptions, TerminalWidget } from './base/terminal-widget';
import { MessageConnection } from 'vscode-jsonrpc';
import { Deferred } from "@theia/core/lib/common/promise-util";

export const TERMINAL_WIDGET_FACTORY_ID = 'terminal';

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

    /* The color of selections. Bla */
    selection: string;
}

@injectable()
export class TerminalWidgetImpl extends TerminalWidget implements StatefulWidget {

    private readonly TERMINAL = "Terminal";
    private readonly onTermDidClose = new Emitter<TerminalWidget>();
    protected terminalId: number;
    protected term: Xterm.Terminal;
    protected restored = false;
    protected closeOnDispose = true;
    protected waitForConnection: Deferred<MessageConnection | undefined>;

    @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService;
    @inject(WebSocketConnectionProvider) protected readonly webSocketConnectionProvider: WebSocketConnectionProvider;
    @inject(TerminalWidgetOptions) options: TerminalWidgetOptions;
    @inject(ShellTerminalServerProxy) protected readonly shellTerminalServer: ShellTerminalServerProxy;
    @inject(TerminalWatcher) protected readonly terminalWatcher: TerminalWatcher;
    @inject(ThemeService) protected readonly themeService: ThemeService;
    @inject(ILogger) @named('terminal') protected readonly logger: ILogger;
    @inject("terminal-dom-id") public readonly id: string;

    protected readonly toDisposeOnConnect = new DisposableCollection();

    @postConstruct()
    protected init(): void {
        this.title.caption = this.options.title || this.TERMINAL;
        this.title.label = this.options.title || this.TERMINAL;
        this.title.iconClass = "fa fa-terminal";

        if (this.options.destroyTermOnClose === true) {
            this.toDispose.push(Disposable.create(() =>
                this.term.destroy()
            ));
        }

        this.title.closable = true;
        this.addClass("terminal-container");

        /* Read CSS properties from the page and apply them to the terminal.  */
        const cssProps = this.getCSSPropertiesFromPage();

        this.term = new Xterm.Terminal({
            cursorBlink: false,
            fontFamily: cssProps.fontFamily,
            fontSize: cssProps.fontSize,
            theme: {
                foreground: cssProps.foreground,
                background: cssProps.background,
                cursor: cssProps.foreground,
                selection: cssProps.selection
            },
        });

        this.toDispose.push(this.themeService.onThemeChange(c => {
            const changedProps = this.getCSSPropertiesFromPage();
            this.term.setOption('theme', {
                foreground: changedProps.foreground,
                background: changedProps.background,
                cursor: changedProps.foreground,
                selection: cssProps.selection
            });
        }));

        this.term.on('title', (title: string) => {
            if (this.options.useServerTitle) {
                this.title.label = title;
            }
        });

        this.toDispose.push(this.terminalWatcher.onTerminalError(({ terminalId }) => {
            if (terminalId === this.terminalId) {
                this.title.label = "<terminal error>";
            }
        }));
        this.toDispose.push(this.terminalWatcher.onTerminalExit(({ terminalId }) => {
            if (terminalId === this.terminalId) {
                this.title.label = "<terminated>";
                this.onTermDidClose.fire(this);
                this.onTermDidClose.dispose();
            }
        }));
        this.toDispose.push(this.toDisposeOnConnect);
        this.toDispose.push(this.shellTerminalServer.onDidCloseConnection(() => {
            const disposable = this.shellTerminalServer.onDidOpenConnection(() => {
                disposable.dispose();
                this.reconnectTerminalProcess();
            });
            this.toDispose.push(disposable);
        }));
        this.toDispose.push(this.onTermDidClose);
    }

    storeState(): object {
        this.closeOnDispose = false;
        return { terminalId: this.terminalId, titleLabel: this.title.label };
    }

    restoreState(oldState: object) {
        if (this.restored === false) {
            const state = oldState as { terminalId: number, titleLabel: string };
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
        const background = lookup(htmlElementProps, '--theia-layout-color0');
        const selection = lookup(htmlElementProps, '--theia-transparent-accent-color2');

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
            throw new Error(`Unexpected format for --theia-layout-color0 (${background})`);
        }

        return {
            fontSize,
            fontFamily,
            foreground,
            background,
            selection
        };
    }

    /**
     * Create a new shell terminal in the back-end and attach it to a
     * new terminal widget.
     * If id is provided attach to the terminal for this id.
     */
    async start(id?: number): Promise<number> {
        this.terminalId = typeof id !== 'number' ? await this.createTerminal() : await this.attachTerminal(id);
        this.resizeTerminalProcess();
        this.connectTerminalProcess();
        if (IBaseTerminalServer.validateId(this.terminalId)) {
            return this.terminalId;
        }
        throw new Error('Failed to start terminal' + (id ? ` for id: ${id}.` : `.`));
    }

    protected async attachTerminal(id: number): Promise<number> {
        const terminalId = await this.shellTerminalServer.attach(id);
        if (IBaseTerminalServer.validateId(terminalId)) {
            return terminalId;
        }
        this.logger.error(`Error attaching to terminal id ${id}, the terminal is most likely gone. Starting up a new terminal instead.`);
        return this.createTerminal();
    }

    protected async createTerminal(): Promise<number> {
        let rootURI = this.options.cwd;
        if (!rootURI) {
            const root = await this.workspaceService.root;
            rootURI = root && root.uri;
        }
        const { cols, rows } = this.term;

        const terminalId = await this.shellTerminalServer.create({
            shell: this.options.shellPath,
            args: this.options.shellArgs,
            env: this.options.env,
            rootURI,
            cols,
            rows
        });
        if (IBaseTerminalServer.validateId(terminalId)) {
            return terminalId;
        }
        throw new Error("Error creating terminal widget, see the backend error log for more information.");
    }

    processMessage(msg: Message): void {
        super.processMessage(msg);
        switch (msg.type) {
            case 'fit-request':
                this.onFitRequest(msg);
                break;
            default:
                break;
        }
    }
    protected onFitRequest(msg: Message): void {
        MessageLoop.sendMessage(this, Widget.ResizeMessage.UnknownSize);
    }
    protected onActivateRequest(msg: Message): void {
        this.term.focus();
    }
    protected onAfterShow(msg: Message): void {
        this.update();
    }
    protected onAfterAttach(msg: Message): void {
        this.update();
    }
    protected onResize(msg: Widget.ResizeMessage): void {
        this.needsResize = true;
        this.update();
    }

    protected termOpened = false;
    protected needsResize = true;
    protected onUpdateRequest(msg: Message): void {
        super.onUpdateRequest(msg);
        if (!this.isVisible || !this.isAttached) {
            return;
        }

        if (!this.termOpened) {
            this.term.open(this.node);
            this.termOpened = true;

            if (isFirefox) {
                // The software scrollbars don't work with xterm.js, so we disable the scrollbar if we are on firefox.
                (this.term.element.children.item(0) as HTMLElement).style.overflow = 'hidden';
            }
        }

        if (this.needsResize) {
            this.resizeTerminal();
            this.needsResize = false;

            this.resizeTerminalProcess();
        }
    }

    protected connectTerminalProcess(): void {
        if (typeof this.terminalId !== "number") {
            return;
        }
        this.toDisposeOnConnect.dispose();
        this.toDispose.push(this.toDisposeOnConnect);
        this.waitForConnection = new Deferred<MessageConnection | undefined>();
        this.webSocketConnectionProvider.listen({
            path: `${terminalsPath}/${this.terminalId}`,
            onConnection: connection => {
                connection.onNotification('onData', (data: string) => this.termOpened && this.term.write(data));

                const sendData = (data?: string) => data && connection.sendRequest('write', data);
                this.term.on('data', sendData);
                connection.onDispose(() => this.term.off('data', sendData));

                this.toDisposeOnConnect.push(connection);
                connection.listen();
                this.waitForConnection.resolve(connection);
            }
        }, { reconnecting: false });
    }
    protected async reconnectTerminalProcess(): Promise<void> {
        if (typeof this.terminalId === "number") {
            await this.start(this.terminalId);
        }
    }

    sendText(text: string): void {
        if (this.waitForConnection) {
            this.waitForConnection.promise.then(connection => {
                if (connection) {
                    connection.sendRequest('write', text);
                }
            });
        }
    }

    get onTerminalDidClose(): Event<TerminalWidget> {
        return this.onTermDidClose.event;
    }

    dispose(): void {
        /* Close the backend terminal only when explicitly closing the terminal
         * a refresh for example won't close it.  */
        if (this.closeOnDispose === true && typeof this.terminalId === "number") {
            this.shellTerminalServer.close(this.terminalId);
            this.onTermDidClose.fire(this);
            this.onTermDidClose.dispose();
        }
        super.dispose();
    }

    protected resizeTerminal(): void {
        const geo = proposeGeometry(this.term);
        const cols = geo.cols;
        const rows = geo.rows - 1; // subtract one row for margin
        this.term.resize(cols, rows);
    }

    protected resizeTerminalProcess(): void {
        if (typeof this.terminalId !== "number") {
            return;
        }
        const { cols, rows } = this.term;
        this.shellTerminalServer.resize(this.terminalId, cols, rows);
    }
}
