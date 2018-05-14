/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as Xterm from 'xterm';
import { inject, injectable, named, postConstruct } from "inversify";
import { Disposable, DisposableCollection, ILogger } from '@theia/core/lib/common';
import { Widget, BaseWidget, Message, WebSocketConnectionProvider, StatefulWidget, isFirefox } from '@theia/core/lib/browser';
import { WorkspaceService } from "@theia/workspace/lib/browser";
import { ShellTerminalServerProxy } from '../common/shell-terminal-protocol';
import { terminalsPath } from '../common/terminal-protocol';
import { IBaseTerminalServer } from '../common/base-terminal-protocol';
import { TerminalWatcher } from '../common/terminal-watcher';
import { ThemeService } from "@theia/core/lib/browser/theming";
import { Deferred } from "@theia/core/lib/common/promise-util";

Xterm.Terminal.applyAddon(require('xterm/lib/addons/fit/fit'));

export const TERMINAL_WIDGET_FACTORY_ID = 'terminal';

export const TerminalWidgetOptions = Symbol("TerminalWidgetOptions");
export interface TerminalWidgetOptions {
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

    /* The color of selections. Bla */
    selection: string;
}

@injectable()
export class TerminalWidget extends BaseWidget implements StatefulWidget {

    private terminalId: number | undefined;
    private term: Xterm.Terminal;
    private cols: number;
    private rows: number;
    protected restored = false;
    protected closeOnDispose = true;
    protected openAfterShow = false;
    protected isOpeningTerm = false;
    protected isTermOpen = false;

    protected readonly waitForResized = new Deferred<void>();
    protected readonly waitForTermOpened = new Deferred<void>();

    @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService;
    @inject(WebSocketConnectionProvider) protected readonly webSocketConnectionProvider: WebSocketConnectionProvider;
    @inject(TerminalWidgetOptions) options: TerminalWidgetOptions;
    @inject(ShellTerminalServerProxy) protected readonly shellTerminalServer: ShellTerminalServerProxy;
    @inject(TerminalWatcher) protected readonly terminalWatcher: TerminalWatcher;
    @inject(ILogger) @named('terminal') protected readonly logger: ILogger;

    protected readonly toDisposeOnConnect = new DisposableCollection();

    @postConstruct()
    protected init(): void {
        this.id = this.options.id;
        this.title.caption = this.options.caption;
        this.title.label = this.options.label;
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

        this.toDispose.push(ThemeService.get().onThemeChange(c => {
            const changedProps = this.getCSSPropertiesFromPage();
            this.term.setOption('theme', {
                foreground: changedProps.foreground,
                background: changedProps.background,
                cursor: changedProps.foreground,
                selection: cssProps.selection
            });
        }));

        this.term.on('title', (title: string) => {
            this.title.label = title;
        });
        if (isFirefox) {
            // The software scrollbars don't work with xterm.js, so we disable the scrollbar if we are on firefox.
            this.waitForTermOpened.promise.then(() => {
                (this.term.element.children.item(0) as HTMLElement).style.overflow = 'hidden';
            });
        }

        this.toDispose.push(this.terminalWatcher.onTerminalError(({ terminalId }) => {
            if (terminalId === this.terminalId) {
                this.title.label = "<terminal error>";
            }
        }));
        this.toDispose.push(this.terminalWatcher.onTerminalExit(({ terminalId }) => {
            if (terminalId === this.terminalId) {
                this.title.label = "<terminated>";
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

    protected registerResize(): void {
        this.term.on('resize', size => {
            if (typeof this.terminalId !== "number") {
                return;
            }

            if (!size) {
                return;
            }

            this.cols = size.cols;
            this.rows = size.rows;
            this.shellTerminalServer.resize(this.terminalId, this.cols, this.rows);
        });
    }

    /**
     * Create a new shell terminal in the back-end and attach it to a
     * new terminal widget.
     * If id is provided attach to the terminal for this id.
     */
    async start(id?: number): Promise<void> {
        await this.waitForResized.promise;
        this.terminalId = typeof id !== 'number' ? await this.createTerminal() : await this.attachTerminal(id);
        if (typeof this.terminalId === "number") {
            await this.doResize();
            this.connectTerminalProcess();
        }
    }
    protected async attachTerminal(id: number): Promise<number | undefined> {
        const terminalId = await this.shellTerminalServer.attach(id);
        if (IBaseTerminalServer.validateId(terminalId)) {
            return terminalId;
        }
        this.logger.error(`Error attaching to terminal id ${id}, the terminal is most likely gone. Starting up a new terminal instead.`);
        return this.createTerminal();
    }
    protected async createTerminal(): Promise<number | undefined> {
        const root = await this.workspaceService.root;
        const rootURI = root && root.uri;
        const { cols, rows } = this;
        const terminalId = await this.shellTerminalServer.create({ rootURI, cols, rows });
        if (IBaseTerminalServer.validateId(terminalId)) {
            return terminalId;
        }
        this.logger.error("Error creating terminal widget, see the backend error log for more information.");
        return undefined;
    }

    protected async openTerm(): Promise<void> {
        this.isOpeningTerm = true;

        if (this.isTermOpen === true) {
            this.isOpeningTerm = false;
            return Promise.reject("Already open");
        }

        /* This may have changed since we waited for waitForStarted. Test it again.  */
        if (this.isVisible === false) {
            this.isOpeningTerm = false;
            return Promise.reject("Not visible");
        }

        this.term.open(this.node);
        this.registerResize();
        this.isTermOpen = true;
        this.waitForTermOpened.resolve();
        return this.waitForTermOpened.promise;
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

    // tslint:disable-next-line:no-any
    private resizeTimer: any;

    protected onResize(msg: Widget.ResizeMessage): void {
        super.onResize(msg);
        this.waitForResized.resolve();
        clearTimeout(this.resizeTimer);
        this.resizeTimer = setTimeout(() => {
            this.waitForTermOpened.promise.then(() => {
                this.doResize();
            });
        }, 50);
    }

    protected connectTerminalProcess(): void {
        if (typeof this.terminalId !== "number") {
            return;
        }
        this.toDisposeOnConnect.dispose();
        this.toDispose.push(this.toDisposeOnConnect);
        this.webSocketConnectionProvider.listen({
            path: `${terminalsPath}/${this.terminalId}`,
            onConnection: connection => {
                connection.onNotification('onData', (data: string) => this.term.write(data));

                const sendData = (data?: string) => data && connection.sendRequest('write', data);
                this.term.on('data', sendData);
                connection.onDispose(() => this.term.off('data', sendData));

                this.toDisposeOnConnect.push(connection);
                connection.listen();
            }
        }, { reconnecting: false });
    }
    protected async reconnectTerminalProcess(): Promise<void> {
        if (typeof this.terminalId === "number") {
            await this.start(this.terminalId);
        }
    }

    dispose(): void {
        /* Close the backend terminal only when explicitly closing the terminal
         * a refresh for example won't close it.  */
        if (this.closeOnDispose === true && typeof this.terminalId === "number") {
            this.shellTerminalServer.close(this.terminalId);
        }
        super.dispose();
    }

    private async doResize() {
        await Promise.all([this.waitForResized.promise, this.waitForTermOpened.promise]);
        const geo = this.term.proposeGeometry();
        this.cols = geo.cols;
        this.rows = geo.rows - 1; // subtract one row for margin
        this.term.resize(this.cols, this.rows);
    }
}
