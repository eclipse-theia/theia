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
import { inject, injectable, named, postConstruct } from 'inversify';
import { ContributionProvider, Disposable, Event, Emitter, ILogger, DisposableCollection } from '@theia/core';
import { Widget, Message, WebSocketConnectionProvider, StatefulWidget, isFirefox, MessageLoop, KeyCode } from '@theia/core/lib/browser';
import { isOSX } from '@theia/core/lib/common';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { ShellTerminalServerProxy } from '../common/shell-terminal-protocol';
import { terminalsPath } from '../common/terminal-protocol';
import { IBaseTerminalServer } from '../common/base-terminal-protocol';
import { TerminalWatcher } from '../common/terminal-watcher';
import { ThemeService } from '@theia/core/lib/browser/theming';
import { TerminalWidgetOptions, TerminalWidget } from './base/terminal-widget';
import { MessageConnection } from 'vscode-jsonrpc';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { TerminalPreferences } from './terminal-preferences';
import { TerminalContribution } from './terminal-contribution';
import URI from '@theia/core/lib/common/uri';
import { TerminalService } from './base/terminal-service';

export const TERMINAL_WIDGET_FACTORY_ID = 'terminal';

export interface TerminalWidgetFactoryOptions extends Partial<TerminalWidgetOptions> {
    /* a unique string per terminal */
    created: string
}

interface TerminalCSSProperties {
    /* The text color, as a CSS color string.  */
    foreground: string;

    /* The background color, as a CSS color string.  */
    background: string;

    /* The color of selections. */
    selection: string;
}

@injectable()
export class TerminalWidgetImpl extends TerminalWidget implements StatefulWidget {

    private readonly TERMINAL = 'Terminal';
    protected readonly onTermDidClose = new Emitter<TerminalWidget>();
    protected terminalId = -1;
    protected term: Xterm.Terminal;
    protected restored = false;
    protected closeOnDispose = true;
    protected waitForConnection: Deferred<MessageConnection> | undefined;
    protected hoverMessage: HTMLDivElement;

    @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService;
    @inject(WebSocketConnectionProvider) protected readonly webSocketConnectionProvider: WebSocketConnectionProvider;
    @inject(TerminalWidgetOptions) options: TerminalWidgetOptions;
    @inject(ShellTerminalServerProxy) protected readonly shellTerminalServer: ShellTerminalServerProxy;
    @inject(TerminalWatcher) protected readonly terminalWatcher: TerminalWatcher;
    @inject(ThemeService) protected readonly themeService: ThemeService;
    @inject(ILogger) @named('terminal') protected readonly logger: ILogger;
    @inject('terminal-dom-id') public readonly id: string;
    @inject(TerminalPreferences) protected readonly preferences: TerminalPreferences;
    @inject(ContributionProvider) @named(TerminalContribution) protected readonly terminalContributionProvider: ContributionProvider<TerminalContribution>;
    @inject(TerminalService) protected readonly terminalService: TerminalService;

    protected readonly onDidOpenEmitter = new Emitter<void>();
    readonly onDidOpen: Event<void> = this.onDidOpenEmitter.event;

    protected readonly toDisposeOnConnect = new DisposableCollection();

    @postConstruct()
    protected init(): void {
        this.title.caption = this.options.title || this.TERMINAL;
        this.title.label = this.options.title || this.TERMINAL;
        this.title.iconClass = 'fa fa-terminal';

        if (this.options.destroyTermOnClose === true) {
            this.toDispose.push(Disposable.create(() =>
                this.term.dispose()
            ));
        }

        this.title.closable = true;
        this.addClass('terminal-container');

        /* Read CSS properties from the page and apply them to the terminal.  */
        const cssProps = this.getCSSPropertiesFromPage();

        this.term = new Xterm.Terminal({
            experimentalCharAtlas: 'dynamic',
            cursorBlink: false,
            fontFamily: this.preferences['terminal.integrated.fontFamily'],
            fontSize: this.preferences['terminal.integrated.fontSize'],
            fontWeight: this.preferences['terminal.integrated.fontWeight'],
            fontWeightBold: this.preferences['terminal.integrated.fontWeightBold'],
            letterSpacing: this.preferences['terminal.integrated.letterSpacing'],
            lineHeight: this.preferences['terminal.integrated.lineHeight'],
            scrollback: this.preferences['terminal.integrated.scrollback'],
            theme: {
                foreground: cssProps.foreground,
                background: cssProps.background,
                cursor: cssProps.foreground,
                selection: cssProps.selection
            },
        });

        this.hoverMessage = document.createElement('div');
        this.hoverMessage.textContent = 'Cmd + click to follow link';
        this.hoverMessage.style.position = 'fixed';
        this.hoverMessage.style.color = 'var(--theia-ui-font-color1)';
        this.hoverMessage.style.backgroundColor = 'var(--theia-layout-color1)';
        this.hoverMessage.style.borderColor = 'var(--theia-layout-color3)';
        this.hoverMessage.style.borderWidth = '0.5px';
        this.hoverMessage.style.borderStyle = 'solid';
        this.hoverMessage.style.padding = '5px';
        this.hoverMessage.style.zIndex = '1';
        // initially invisible
        this.hoverMessage.style.display = 'none';
        this.node.appendChild(this.hoverMessage);

        this.toDispose.push(this.preferences.onPreferenceChanged(change => {
            const lastSeparator = change.preferenceName.lastIndexOf('.');
            if (lastSeparator > 0) {
                const preferenceName = change.preferenceName.substr(lastSeparator + 1);
                this.term.setOption(preferenceName, this.preferences[change.preferenceName]);
                this.needsResize = true;
                this.update();
            }
        }));

        this.toDispose.push(this.themeService.onThemeChange(c => {
            const changedProps = this.getCSSPropertiesFromPage();
            this.term.setOption('theme', {
                foreground: changedProps.foreground,
                background: changedProps.background,
                cursor: changedProps.foreground,
                selection: cssProps.selection
            });
        }));
        this.attachCustomKeyEventHandler();
        const titleChangeListenerDispose = this.term.onTitleChange((title: string) => {
            if (this.options.useServerTitle) {
                this.title.label = title;
            }
        });
        this.toDispose.push(titleChangeListenerDispose);

        this.toDispose.push(this.terminalWatcher.onTerminalError(({ terminalId, error }) => {
            if (terminalId === this.terminalId) {
                this.dispose();
                this.onTermDidClose.fire(this);
                this.onTermDidClose.dispose();
                this.logger.error(`The terminal process terminated. Cause: ${error}`);
            }
        }));
        this.toDispose.push(this.terminalWatcher.onTerminalExit(({ terminalId }) => {
            if (terminalId === this.terminalId) {
                this.dispose();
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
        this.toDispose.push(this.onDidOpenEmitter);

        for (const contribution of this.terminalContributionProvider.getContributions()) {
            contribution.onCreate(this);
        }
    }

    showHoverMessage(x: number, y: number, message: string): void {
        this.hoverMessage.innerText = message;
        this.hoverMessage.style.display = 'inline';
        this.hoverMessage.style.top = `${y - 30}px`;
        this.hoverMessage.style.left = `${x - 60}px`;
    }

    hideHover(): void {
        this.hoverMessage.style.display = 'none';
    }

    getTerminal(): Xterm.Terminal {
        return this.term;
    }

    get cwd(): Promise<URI> {
        if (!IBaseTerminalServer.validateId(this.terminalId)) {
            return Promise.reject(new Error('terminal is not started'));
        }
        if (this.terminalService.getById(this.id)) {
            return this.shellTerminalServer.getCwdURI(this.terminalId)
                .then(cwdUrl => new URI(cwdUrl));
        }
        return Promise.resolve(new URI());
    }

    get processId(): Promise<number> {
        if (!IBaseTerminalServer.validateId(this.terminalId)) {
            return Promise.reject(new Error('terminal is not started'));
        }
        return this.shellTerminalServer.getProcessId(this.terminalId);
    }

    onDispose(onDispose: () => void): void {
        this.toDispose.push(Disposable.create(onDispose));
    }

    clearOutput(): void {
        this.term.clear();
    }

    storeState(): object {
        this.closeOnDispose = false;
        return { terminalId: this.terminalId, titleLabel: this.title.label };
    }

    restoreState(oldState: object): void {
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
            const value = props.getPropertyValue(name).trim();
            if (!value) {
                throw new Error(`Couldn\'t find value of ${name}`);
            }

            return value;
        }

        /* Get the CSS properties of <html> (aka :root in css).  */
        const htmlElementProps = getComputedStyle(document.documentElement!);

        const foreground = lookup(htmlElementProps, '--theia-ui-font-color1');
        const background = lookup(htmlElementProps, '--theia-layout-color0');
        const selection = lookup(htmlElementProps, '--theia-transparent-accent-color2');

        /* xterm.js expects #XXX of #XXXXXX for colors.  */
        const colorRe = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

        if (!foreground.match(colorRe)) {
            throw new Error(`Unexpected format for --theia-ui-font-color1 (${foreground})`);
        }

        if (!background.match(colorRe)) {
            throw new Error(`Unexpected format for --theia-layout-color0 (${background})`);
        }

        return {
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
            this.onDidOpenEmitter.fire(undefined);
            return this.terminalId;
        }
        throw new Error('Failed to start terminal' + (id ? ` for id: ${id}.` : '.'));
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
            const root = (await this.workspaceService.roots)[0];
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
        throw new Error('Error creating terminal widget, see the backend error log for more information.');
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
        super.onFitRequest(msg);
        MessageLoop.sendMessage(this, Widget.ResizeMessage.UnknownSize);
    }
    protected onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.term.focus();
    }
    protected onAfterShow(msg: Message): void {
        super.onAfterShow(msg);
        this.update();
    }
    protected onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        this.update();
    }
    protected onResize(msg: Widget.ResizeMessage): void {
        super.onResize(msg);
        this.needsResize = true;
        this.update();
    }

    protected needsResize = true;
    protected onUpdateRequest(msg: Message): void {
        super.onUpdateRequest(msg);
        if (!this.isVisible || !this.isAttached) {
            return;
        }

        this.open();

        if (this.needsResize) {
            this.resizeTerminal();
            this.needsResize = false;

            this.resizeTerminalProcess();
        }
    }

    // Device status code emitted by Xterm.js
    // Check: https://github.com/xtermjs/xterm.js/blob/release/3.14/src/InputHandler.ts#L1055-L1082
    protected readonly deviceStatusCodes = new Set(['\u001B[>0;276;0c', '\u001B[>85;95;0c', '\u001B[>83;40003;0c', '\u001B[?1;2c', '\u001B[?6c']);

    protected connectTerminalProcess(): void {
        if (typeof this.terminalId !== 'number') {
            return;
        }
        this.toDisposeOnConnect.dispose();
        this.toDispose.push(this.toDisposeOnConnect);
        this.term.reset();
        const waitForConnection = this.waitForConnection = new Deferred<MessageConnection>();
        this.webSocketConnectionProvider.listen({
            path: `${terminalsPath}/${this.terminalId}`,
            onConnection: connection => {
                connection.onNotification('onData', (data: string) => this.write(data));

                // Excludes the device status code emitted by Xterm.js
                const sendData = (data?: string) => {
                    if (data && !this.deviceStatusCodes.has(data)) {
                        return connection.sendRequest('write', data);
                    }
                };

                const disposable = this.term.onData(sendData);
                connection.onDispose(() => disposable.dispose());

                this.toDisposeOnConnect.push(connection);
                connection.listen();
                if (waitForConnection) {
                    waitForConnection.resolve(connection);
                }
            }
        }, { reconnecting: false });
    }
    protected async reconnectTerminalProcess(): Promise<void> {
        if (typeof this.terminalId === 'number') {
            await this.start(this.terminalId);
        }
    }

    protected termOpened = false;
    protected initialData = '';
    protected open(): void {
        if (this.termOpened) {
            return;
        }
        this.term.open(this.node);
        if (this.initialData) {
            this.term.write(this.initialData);
        }
        this.termOpened = true;
        this.initialData = '';

        if (isFirefox) {
            // The software scrollbars don't work with xterm.js, so we disable the scrollbar if we are on firefox.
            (this.term.element.children.item(0) as HTMLElement).style.overflow = 'hidden';
        }
    }
    protected write(data: string): void {
        if (this.termOpened) {
            this.term.write(data);
        } else {
            this.initialData += data;
        }
    }

    sendText(text: string): void {
        if (this.waitForConnection) {
            this.waitForConnection.promise.then(connection =>
                connection.sendRequest('write', text)
            );
        }
    }

    get onTerminalDidClose(): Event<TerminalWidget> {
        return this.onTermDidClose.event;
    }

    dispose(): void {
        /* Close the backend terminal only when explicitly closing the terminal
         * a refresh for example won't close it.  */
        if (this.closeOnDispose === true && typeof this.terminalId === 'number') {
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
        if (!IBaseTerminalServer.validateId(this.terminalId)
            && !this.terminalService.getById(this.id)) {
            return;
        }
        const { cols, rows } = this.term;
        this.shellTerminalServer.resize(this.terminalId, cols, rows);
    }

    protected get enableCopy(): boolean {
        return this.preferences['terminal.enableCopy'];
    }

    protected get enablePaste(): boolean {
        return this.preferences['terminal.enablePaste'];
    }

    protected customKeyHandler(event: KeyboardEvent): boolean {
        const keyBindings = KeyCode.createKeyCode(event).toString();
        const ctrlCmdCopy = (isOSX && keyBindings === 'meta+c') || (!isOSX && keyBindings === 'ctrl+c');
        const ctrlCmdPaste = (isOSX && keyBindings === 'meta+v') || (!isOSX && keyBindings === 'ctrl+v');
        if (ctrlCmdCopy && this.enableCopy && this.term.hasSelection()) {
            return false;
        }
        if (ctrlCmdPaste && this.enablePaste) {
            return false;
        }
        return true;
    }
    protected attachCustomKeyEventHandler(): void {
        this.term.attachCustomKeyEventHandler(e => this.customKeyHandler(e));
    }

}
