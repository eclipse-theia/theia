// *****************************************************************************
// Copyright (C) 2017 TypeFox and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { Terminal, RendererType } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { inject, injectable, named, postConstruct } from '@theia/core/shared/inversify';
import { ContributionProvider, Disposable, Event, Emitter, ILogger, DisposableCollection, Channel, OS } from '@theia/core';
import {
    Widget, Message, WebSocketConnectionProvider, StatefulWidget, isFirefox, MessageLoop, KeyCode, codicon, ExtractableWidget, ContextMenuRenderer
} from '@theia/core/lib/browser';
import { isOSX } from '@theia/core/lib/common';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { ShellTerminalServerProxy, IShellTerminalPreferences } from '../common/shell-terminal-protocol';
import { terminalsPath } from '../common/terminal-protocol';
import { IBaseTerminalServer, TerminalProcessInfo, TerminalExitReason } from '../common/base-terminal-protocol';
import { TerminalWatcher } from '../common/terminal-watcher';
import {
    TerminalWidgetOptions, TerminalWidget, TerminalDimensions, TerminalExitStatus, TerminalLocationOptions,
    TerminalLocation
} from './base/terminal-widget';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { TerminalPreferences, TerminalRendererType, isTerminalRendererType, DEFAULT_TERMINAL_RENDERER_TYPE, CursorStyle } from './terminal-preferences';
import URI from '@theia/core/lib/common/uri';
import { TerminalService } from './base/terminal-service';
import { TerminalSearchWidgetFactory, TerminalSearchWidget } from './search/terminal-search-widget';
import { TerminalCopyOnSelectionHandler } from './terminal-copy-on-selection-handler';
import { TerminalThemeService } from './terminal-theme-service';
import { CommandLineOptions, ShellCommandBuilder } from '@theia/process/lib/common/shell-command-builder';
import { Key } from '@theia/core/lib/browser/keys';
import { nls } from '@theia/core/lib/common/nls';
import { TerminalMenus } from './terminal-frontend-contribution';

export const TERMINAL_WIDGET_FACTORY_ID = 'terminal';

export interface TerminalWidgetFactoryOptions extends Partial<TerminalWidgetOptions> {
    /* a unique string per terminal */
    created: string
}

export const TerminalContribution = Symbol('TerminalContribution');
export interface TerminalContribution {
    onCreate(term: TerminalWidgetImpl): void;
}

@injectable()
export class TerminalWidgetImpl extends TerminalWidget implements StatefulWidget, ExtractableWidget {
    readonly isExtractable: boolean = true;
    secondaryWindow: Window | undefined;
    location: TerminalLocationOptions;

    static LABEL = nls.localizeByDefault('Terminal');

    exitStatus: TerminalExitStatus | undefined;

    protected terminalKind = 'user';
    protected _terminalId = -1;
    protected readonly onTermDidClose = new Emitter<TerminalWidget>();
    protected fitAddon: FitAddon;
    protected term: Terminal;
    protected searchBox: TerminalSearchWidget;
    protected restored = false;
    protected closeOnDispose = true;
    protected waitForConnection: Deferred<Channel> | undefined;
    protected linkHover: HTMLDivElement;
    protected linkHoverButton: HTMLAnchorElement;
    protected lastTouchEnd: TouchEvent | undefined;
    protected lastMousePosition: { x: number, y: number } | undefined;
    protected isAttachedCloseListener: boolean = false;
    protected shown = false;
    override lastCwd = new URI();

    @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService;
    @inject(WebSocketConnectionProvider) protected readonly webSocketConnectionProvider: WebSocketConnectionProvider;
    @inject(TerminalWidgetOptions) options: TerminalWidgetOptions;
    @inject(ShellTerminalServerProxy) protected readonly shellTerminalServer: ShellTerminalServerProxy;
    @inject(TerminalWatcher) protected readonly terminalWatcher: TerminalWatcher;
    @inject(ILogger) @named('terminal') protected readonly logger: ILogger;
    @inject('terminal-dom-id') override readonly id: string;
    @inject(TerminalPreferences) protected readonly preferences: TerminalPreferences;
    @inject(ContributionProvider) @named(TerminalContribution) protected readonly terminalContributionProvider: ContributionProvider<TerminalContribution>;
    @inject(TerminalService) protected readonly terminalService: TerminalService;
    @inject(TerminalSearchWidgetFactory) protected readonly terminalSearchBoxFactory: TerminalSearchWidgetFactory;
    @inject(TerminalCopyOnSelectionHandler) protected readonly copyOnSelectionHandler: TerminalCopyOnSelectionHandler;
    @inject(TerminalThemeService) protected readonly themeService: TerminalThemeService;
    @inject(ShellCommandBuilder) protected readonly shellCommandBuilder: ShellCommandBuilder;
    @inject(ContextMenuRenderer) protected readonly contextMenuRenderer: ContextMenuRenderer;

    protected readonly onDidOpenEmitter = new Emitter<void>();
    readonly onDidOpen: Event<void> = this.onDidOpenEmitter.event;

    protected readonly onDidOpenFailureEmitter = new Emitter<void>();
    readonly onDidOpenFailure: Event<void> = this.onDidOpenFailureEmitter.event;

    protected readonly onSizeChangedEmitter = new Emitter<{ cols: number; rows: number; }>();
    readonly onSizeChanged: Event<{ cols: number; rows: number; }> = this.onSizeChangedEmitter.event;

    protected readonly onDataEmitter = new Emitter<string>();
    readonly onData: Event<string> = this.onDataEmitter.event;

    protected readonly onKeyEmitter = new Emitter<{ key: string, domEvent: KeyboardEvent }>();
    readonly onKey: Event<{ key: string, domEvent: KeyboardEvent }> = this.onKeyEmitter.event;

    protected readonly onMouseEnterLinkHoverEmitter = new Emitter<MouseEvent>();
    readonly onMouseEnterLinkHover: Event<MouseEvent> = this.onMouseEnterLinkHoverEmitter.event;

    protected readonly onMouseLeaveLinkHoverEmitter = new Emitter<MouseEvent>();
    readonly onMouseLeaveLinkHover: Event<MouseEvent> = this.onMouseLeaveLinkHoverEmitter.event;

    protected readonly toDisposeOnConnect = new DisposableCollection();

    @postConstruct()
    protected init(): void {
        this.setTitle(this.options.title || TerminalWidgetImpl.LABEL);

        if (this.options.iconClass) {
            this.title.iconClass = this.options.iconClass;
        } else {
            this.title.iconClass = codicon('terminal');
        }

        if (this.options.kind) {
            this.terminalKind = this.options.kind;
        }

        if (this.options.destroyTermOnClose === true) {
            this.toDispose.push(Disposable.create(() =>
                this.term.dispose()
            ));
        }

        this.location = this.options.location || TerminalLocation.Panel;

        this.title.closable = true;
        this.addClass('terminal-container');

        this.term = new Terminal({
            cursorBlink: this.preferences['terminal.integrated.cursorBlinking'],
            cursorStyle: this.getCursorStyle(),
            cursorWidth: this.preferences['terminal.integrated.cursorWidth'],
            fontFamily: this.preferences['terminal.integrated.fontFamily'],
            fontSize: this.preferences['terminal.integrated.fontSize'],
            fontWeight: this.preferences['terminal.integrated.fontWeight'],
            fontWeightBold: this.preferences['terminal.integrated.fontWeightBold'],
            drawBoldTextInBrightColors: this.preferences['terminal.integrated.drawBoldTextInBrightColors'],
            letterSpacing: this.preferences['terminal.integrated.letterSpacing'],
            lineHeight: this.preferences['terminal.integrated.lineHeight'],
            scrollback: this.preferences['terminal.integrated.scrollback'],
            fastScrollSensitivity: this.preferences['terminal.integrated.fastScrollSensitivity'],
            rendererType: this.getTerminalRendererType(this.preferences['terminal.integrated.rendererType']),
            theme: this.themeService.theme
        });

        this.fitAddon = new FitAddon();
        this.term.loadAddon(this.fitAddon);

        this.initializeLinkHover();

        this.toDispose.push(this.preferences.onPreferenceChanged(change => {
            const lastSeparator = change.preferenceName.lastIndexOf('.');
            if (lastSeparator > 0) {
                let preferenceName = change.preferenceName.substr(lastSeparator + 1);
                let preferenceValue = change.newValue;

                if (preferenceName === 'rendererType') {
                    const newRendererType = preferenceValue as string;
                    if (newRendererType !== this.getTerminalRendererType(newRendererType)) {
                        // Given terminal renderer type is not supported or invalid
                        preferenceValue = DEFAULT_TERMINAL_RENDERER_TYPE;
                    }
                } else if (preferenceName === 'cursorBlinking') {
                    // Convert the terminal preference into a valid `xterm` option
                    preferenceName = 'cursorBlink';
                } else if (preferenceName === 'cursorStyle') {
                    preferenceValue = this.getCursorStyle();
                }
                try {
                    this.term.setOption(preferenceName, preferenceValue);
                } catch (e) {
                    console.debug(`xterm configuration: '${preferenceName}' with value '${preferenceValue}' is not valid.`);
                }
                this.needsResize = true;
                this.update();
            }
        }));

        this.toDispose.push(this.themeService.onDidChange(() => this.term.setOption('theme', this.themeService.theme)));
        this.attachCustomKeyEventHandler();
        const titleChangeListenerDispose = this.term.onTitleChange((title: string) => {
            if (this.options.useServerTitle) {
                this.title.label = title;
            }
        });
        this.toDispose.push(titleChangeListenerDispose);

        this.toDispose.push(this.terminalWatcher.onTerminalError(({ terminalId, error }) => {
            if (terminalId === this.terminalId) {
                this.exitStatus = { code: undefined, reason: TerminalExitReason.Process };
                this.dispose();
                this.logger.error(`The terminal process terminated. Cause: ${error}`);
            }
        }));
        this.toDispose.push(this.terminalWatcher.onTerminalExit(({ terminalId, code, reason }) => {
            if (terminalId === this.terminalId) {
                if (reason) {
                    this.exitStatus = { code, reason };
                } else {
                    this.exitStatus = { code, reason: TerminalExitReason.Process };
                }
                this.dispose();
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
        this.toDispose.push(this.onDidOpenFailureEmitter);
        this.toDispose.push(this.onSizeChangedEmitter);
        this.toDispose.push(this.onDataEmitter);
        this.toDispose.push(this.onKeyEmitter);

        const touchEndListener = (event: TouchEvent) => {
            if (this.node.contains(event.target as Node)) {
                this.lastTouchEnd = event;
            }
        };
        document.addEventListener('touchend', touchEndListener, { passive: true });
        this.onDispose(() => {
            document.removeEventListener('touchend', touchEndListener);
        });

        const mouseListener = (event: MouseEvent) => {
            this.lastMousePosition = { x: event.x, y: event.y };
        };
        this.node.addEventListener('mousemove', mouseListener);
        this.onDispose(() => {
            this.node.removeEventListener('mousemove', mouseListener);
        });

        const contextMenuListener = (event: MouseEvent) => {
            event.preventDefault();
            event.stopPropagation();
            this.contextMenuRenderer.render({ menuPath: TerminalMenus.TERMINAL_CONTEXT_MENU, anchor: event });
        };
        this.node.addEventListener('contextmenu', contextMenuListener);
        this.onDispose(() => this.node.removeEventListener('contextmenu', contextMenuListener));

        this.toDispose.push(this.term.onSelectionChange(() => {
            if (this.copyOnSelection) {
                this.copyOnSelectionHandler.copy(this.term.getSelection());
            }
        }));

        this.toDispose.push(this.term.onResize(data => {
            this.onSizeChangedEmitter.fire(data);
        }));

        this.toDispose.push(this.term.onData(data => {
            this.onDataEmitter.fire(data);
        }));

        this.toDispose.push(this.term.onBinary(data => {
            this.onDataEmitter.fire(data);
        }));

        this.toDispose.push(this.term.onKey(data => {
            this.onKeyEmitter.fire(data);
        }));

        for (const contribution of this.terminalContributionProvider.getContributions()) {
            contribution.onCreate(this);
        }

        this.searchBox = this.terminalSearchBoxFactory(this.term);
        this.toDispose.push(this.searchBox);
    }

    get kind(): 'user' | string {
        return this.terminalKind;
    }

    /**
     * Get the cursor style compatible with `xterm`.
     * @returns CursorStyle
     */
    private getCursorStyle(): CursorStyle {
        const value = this.preferences['terminal.integrated.cursorStyle'];
        return value === 'line' ? 'bar' : value;
    }

    /**
     * Returns given renderer type if it is valid and supported or default renderer otherwise.
     *
     * @param terminalRendererType desired terminal renderer type
     */
    private getTerminalRendererType(terminalRendererType?: string | TerminalRendererType): RendererType {
        if (terminalRendererType && isTerminalRendererType(terminalRendererType)) {
            return terminalRendererType;
        }
        return DEFAULT_TERMINAL_RENDERER_TYPE;
    }

    protected initializeLinkHover(): void {
        this.linkHover = document.createElement('div');
        this.linkHover.style.position = 'fixed';
        this.linkHover.style.color = 'var(--theia-editorHoverWidget-foreground)';
        this.linkHover.style.backgroundColor = 'var(--theia-editorHoverWidget-background)';
        this.linkHover.style.borderColor = 'var(--theia-editorHoverWidget-border)';
        this.linkHover.style.borderWidth = '0.5px';
        this.linkHover.style.borderStyle = 'solid';
        this.linkHover.style.padding = '5px';
        // Above the xterm.js canvas layers:
        // https://github.com/xtermjs/xterm.js/blob/ff790236c1b205469f17a21246141f512d844295/src/renderer/Renderer.ts#L41-L46
        this.linkHover.style.zIndex = '10';
        // Initially invisible:
        this.linkHover.style.display = 'none';

        this.linkHoverButton = document.createElement('a');
        this.linkHoverButton.textContent = this.linkHoverMessage();
        this.linkHoverButton.style.cursor = 'pointer';
        this.linkHover.appendChild(this.linkHoverButton);

        const cmdCtrl = isOSX ? 'cmd' : 'ctrl';
        const cmdHint = document.createTextNode(` (${nls.localizeByDefault(`${cmdCtrl} + click`)})`);
        this.linkHover.appendChild(cmdHint);

        const onMouseEnter = (mouseEvent: MouseEvent) => this.onMouseEnterLinkHoverEmitter.fire(mouseEvent);
        this.linkHover.addEventListener('mouseenter', onMouseEnter);
        this.toDispose.push(Disposable.create(() => this.linkHover.removeEventListener('mouseenter', onMouseEnter)));

        const onMouseLeave = (mouseEvent: MouseEvent) => this.onMouseLeaveLinkHoverEmitter.fire(mouseEvent);
        this.linkHover.addEventListener('mouseleave', onMouseLeave);
        this.toDispose.push(Disposable.create(() => this.linkHover.removeEventListener('mouseleave', onMouseLeave)));

        this.node.appendChild(this.linkHover);
    }

    showLinkHover(invokeAction: (event: MouseEvent) => void, x: number, y: number, message?: string): void {
        const mouseY = this.lastMousePosition?.y ?? y;
        const mouseX = this.lastMousePosition?.x ?? x;
        this.linkHoverButton.textContent = this.linkHoverMessage(message);
        this.linkHoverButton.onclick = (mouseEvent: MouseEvent) => invokeAction(mouseEvent);
        this.linkHover.style.display = 'inline';
        this.linkHover.style.top = `${mouseY - 30}px`;
        this.linkHover.style.left = `${mouseX - 60}px`;
    }

    protected linkHoverMessage(message?: string): string {
        return message ?? nls.localizeByDefault('Follow link');
    }

    hideLinkHover(): void {
        this.linkHover.style.display = 'none';
        // eslint-disable-next-line no-null/no-null
        this.linkHoverButton.onclick = null;
    }

    getTerminal(): Terminal {
        return this.term;
    }

    getSearchBox(): TerminalSearchWidget {
        return this.searchBox;
    }

    protected override onCloseRequest(msg: Message): void {
        this.exitStatus = { code: undefined, reason: TerminalExitReason.User };
        super.onCloseRequest(msg);
    }

    get dimensions(): TerminalDimensions {
        return {
            cols: this.term.cols,
            rows: this.term.rows,
        };
    }

    get cwd(): Promise<URI> {
        if (!IBaseTerminalServer.validateId(this.terminalId)) {
            return Promise.reject(new Error('terminal is not started'));
        }
        if (this.terminalService.getById(this.id)) {
            return this.shellTerminalServer.getCwdURI(this.terminalId)
                .then(cwdUrl => {
                    this.lastCwd = new URI(cwdUrl);
                    return this.lastCwd;
                }).catch(() => this.lastCwd);
        }
        return Promise.resolve(new URI());
    }

    get processId(): Promise<number> {
        if (!IBaseTerminalServer.validateId(this.terminalId)) {
            return Promise.reject(new Error('terminal is not started'));
        }
        return this.shellTerminalServer.getProcessId(this.terminalId);
    }

    get processInfo(): Promise<TerminalProcessInfo> {
        if (!IBaseTerminalServer.validateId(this.terminalId)) {
            return Promise.reject(new Error('terminal is not started'));
        }
        return this.shellTerminalServer.getProcessInfo(this.terminalId);
    }

    get terminalId(): number {
        return this._terminalId;
    }

    get lastTouchEndEvent(): TouchEvent | undefined {
        return this.lastTouchEnd;
    }

    get hiddenFromUser(): boolean {
        if (this.shown) {
            return false;
        }
        return this.options.hideFromUser ?? false;
    }

    get transient(): boolean {
        // The terminal is transient if session persistence is disabled or it's explicitly marked as transient
        return !this.preferences['terminal.integrated.enablePersistentSessions'] || !!this.options.isTransient;
    }

    onDispose(onDispose: () => void): void {
        this.toDispose.push(Disposable.create(onDispose));
    }

    clearOutput(): void {
        this.term.clear();
    }

    selectAll(): void {
        this.term.selectAll();
    }

    async hasChildProcesses(): Promise<boolean> {
        return this.shellTerminalServer.hasChildProcesses(await this.processId);
    }

    storeState(): object {
        this.closeOnDispose = false;
        if (this.transient || this.options.isPseudoTerminal) {
            return {};
        }
        return { terminalId: this.terminalId, titleLabel: this.title.label };
    }

    restoreState(oldState: object): void {
        // transient terminals and pseudo terminals are not restored
        if (this.transient || this.options.isPseudoTerminal) {
            this.dispose();
            return;
        }
        if (this.restored === false) {
            const state = oldState as { terminalId: number, titleLabel: string };
            /* This is a workaround to issue #879 */
            this.restored = true;
            this.title.label = state.titleLabel;
            this.start(state.terminalId);
        }
    }

    /**
     * Create a new shell terminal in the back-end and attach it to a
     * new terminal widget.
     * If id is provided attach to the terminal for this id.
     */
    async start(id?: number): Promise<number> {
        this._terminalId = typeof id !== 'number' ? await this.createTerminal() : await this.attachTerminal(id);
        this.resizeTerminalProcess();
        this.connectTerminalProcess();
        if (IBaseTerminalServer.validateId(this.terminalId)) {
            this.onDidOpenEmitter.fire(undefined);
            await this.shellTerminalServer.onAttachAttempted(this._terminalId);
            return this.terminalId;
        }
        this.onDidOpenFailureEmitter.fire(undefined);
        throw new Error('Failed to start terminal' + (id ? ` for id: ${id}.` : '.'));
    }

    protected async attachTerminal(id: number): Promise<number> {
        const terminalId = await this.shellTerminalServer.attach(id);
        if (IBaseTerminalServer.validateId(terminalId)) {
            return terminalId;
        }
        this.logger.warn(`Failed attaching to terminal id ${id}, the terminal is most likely gone. Starting up a new terminal instead.`);
        if (this.kind === 'user') {
            return this.createTerminal();
        } else {
            return -1;
        }
    }

    protected async createTerminal(): Promise<number> {
        let rootURI = this.options.cwd?.toString();
        if (!rootURI) {
            const root = (await this.workspaceService.roots)[0];
            rootURI = root?.resource?.toString();
        }
        const { cols, rows } = this.term;

        const terminalId = await this.shellTerminalServer.create({
            shell: this.options.shellPath || this.shellPreferences.shell[OS.backend.type()],
            args: this.options.shellArgs || this.shellPreferences.shellArgs[OS.backend.type()],
            env: this.options.env,
            strictEnv: this.options.strictEnv,
            isPseudo: this.options.isPseudoTerminal,
            rootURI,
            cols,
            rows
        });
        if (IBaseTerminalServer.validateId(terminalId)) {
            return terminalId;
        }
        throw new Error('Error creating terminal widget, see the backend error log for more information.');
    }

    override processMessage(msg: Message): void {
        super.processMessage(msg);
        switch (msg.type) {
            case 'fit-request':
                this.onFitRequest(msg);
                break;
            default:
                break;
        }
    }
    protected override onFitRequest(msg: Message): void {
        super.onFitRequest(msg);
        MessageLoop.sendMessage(this, Widget.ResizeMessage.UnknownSize);
    }
    protected override onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.term.focus();
    }
    protected override onAfterShow(msg: Message): void {
        super.onAfterShow(msg);
        this.update();
        this.shown = true;
    }
    protected override onAfterAttach(msg: Message): void {
        Widget.attach(this.searchBox, this.node);
        super.onAfterAttach(msg);
        this.update();
    }
    protected override onBeforeDetach(msg: Message): void {
        Widget.detach(this.searchBox);
        super.onBeforeDetach(msg);
    }
    protected override onResize(msg: Widget.ResizeMessage): void {
        super.onResize(msg);
        this.needsResize = true;
        this.update();
    }

    protected needsResize = true;
    protected override onUpdateRequest(msg: Message): void {
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
        if (this.options.isPseudoTerminal) {
            return;
        }
        this.toDisposeOnConnect.dispose();
        this.toDispose.push(this.toDisposeOnConnect);
        const waitForConnection = this.waitForConnection = new Deferred<Channel>();
        this.webSocketConnectionProvider.listen({
            path: `${terminalsPath}/${this.terminalId}`,
            onConnection: connection => {
                connection.onMessage(e => {
                    this.write(e().readString());
                });

                // Excludes the device status code emitted by Xterm.js
                const sendData = (data?: string) => {
                    if (data && !this.deviceStatusCodes.has(data) && !this.disableEnterWhenAttachCloseListener()) {
                        connection.getWriteBuffer().writeString(data).commit();
                    }
                };

                const disposable = new DisposableCollection();
                disposable.push(this.term.onData(sendData));
                disposable.push(this.term.onBinary(sendData));

                connection.onClose(() => disposable.dispose());

                if (waitForConnection) {
                    waitForConnection.resolve(connection);
                }
            }
        }, { reconnecting: false });
    }
    protected async reconnectTerminalProcess(): Promise<void> {
        if (this.options.isPseudoTerminal) {
            return;
        }
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

        if (isFirefox) {
            // monkey patching intersection observer handling for secondary window support
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const renderService: any = (this.term as any)._core._renderService;
            const originalFunc: (entry: IntersectionObserverEntry) => void = renderService._onIntersectionChange.bind(renderService);
            const replacement = function (entry: IntersectionObserverEntry): void {
                if (entry.target.ownerDocument !== document) {
                    // in Firefox, the intersection observer always reports the widget as non-intersecting if the dom element
                    // is in a different document from when the IntersectionObserver started observing. Since we know
                    // that the widget is always "visible" when in a secondary window, so we mark the entry as "intersecting"
                    const patchedEvent: IntersectionObserverEntry = {
                        ...entry,
                        isIntersecting: true,
                    };
                    originalFunc(patchedEvent);
                } else {
                    originalFunc(entry);
                }
            };

            renderService._onIntersectionChange = replacement;
        }

        if (this.initialData) {
            this.term.write(this.initialData);
        }
        this.termOpened = true;
        this.initialData = '';

        if (isFirefox) {
            // The software scrollbars don't work with xterm.js, so we disable the scrollbar if we are on firefox.
            if (this.term.element) {
                (this.term.element.children.item(0) as HTMLElement).style.overflow = 'hidden';
            }
        }
    }

    write(data: string): void {
        if (this.termOpened) {
            this.term.write(data);
        } else {
            this.initialData += data;
        }
    }

    resize(cols: number, rows: number): void {
        this.term.resize(cols, rows);
    }

    sendText(text: string): void {
        if (this.waitForConnection) {
            this.waitForConnection.promise.then(connection =>
                connection.getWriteBuffer().writeString(text).commit()
            );
        }
    }

    async executeCommand(commandOptions: CommandLineOptions): Promise<void> {
        this.sendText(this.shellCommandBuilder.buildCommand(await this.processInfo, commandOptions) + '\n');
    }

    scrollLineUp(): void {
        this.term.scrollLines(-1);
    }

    scrollLineDown(): void {
        this.term.scrollLines(1);
    }

    scrollToTop(): void {
        this.term.scrollToTop();
    }

    scrollToBottom(): void {
        this.term.scrollToBottom();
    }

    scrollPageUp(): void {
        this.term.scrollPages(-1);
    }

    scrollPageDown(): void {
        this.term.scrollPages(1);
    }

    resetTerminal(): void {
        this.term.reset();
    }

    writeLine(text: string): void {
        this.term.writeln(text);
    }

    get onTerminalDidClose(): Event<TerminalWidget> {
        return this.onTermDidClose.event;
    }

    override dispose(): void {
        if (this.closeOnDispose === true && typeof this.terminalId === 'number' && !this.exitStatus) {
            // Close the backend terminal only when explicitly closing the terminal
            // a refresh for example won't close it.
            this.shellTerminalServer.close(this.terminalId);
            // Exit status is set when terminal is closed by user or by process, so most likely an extension closed it.
            this.exitStatus = { code: undefined, reason: TerminalExitReason.Extension };
        }
        if (this.exitStatus) {
            this.onTermDidClose.fire(this);
        }
        super.dispose();
    }

    protected resizeTerminal(): void {
        const geo = this.fitAddon.proposeDimensions();
        const cols = geo.cols;
        const rows = geo.rows - 1; // subtract one row for margin
        this.term.resize(cols, rows);
    }

    protected resizeTerminalProcess(): void {
        if (this.options.isPseudoTerminal) {
            return;
        }
        if (!IBaseTerminalServer.validateId(this.terminalId)
            || !this.terminalService.getById(this.id)) {
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

    protected get shellPreferences(): IShellTerminalPreferences {
        return {
            shell: {
                Windows: this.preferences['terminal.integrated.shell.windows'] ?? undefined,
                Linux: this.preferences['terminal.integrated.shell.linux'] ?? undefined,
                OSX: this.preferences['terminal.integrated.shell.osx'] ?? undefined,
            },
            shellArgs: {
                Windows: this.preferences['terminal.integrated.shellArgs.windows'],
                Linux: this.preferences['terminal.integrated.shellArgs.linux'],
                OSX: this.preferences['terminal.integrated.shellArgs.osx'],
            }
        };
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

    protected get copyOnSelection(): boolean {
        return this.preferences['terminal.integrated.copyOnSelection'];
    }

    protected attachCustomKeyEventHandler(): void {
        this.term.attachCustomKeyEventHandler(e => this.customKeyHandler(e));
    }

    setTitle(title: string): void {
        this.title.caption = title;
        this.title.label = title;
    }

    waitOnExit(waitOnExit?: boolean | string): void {
        if (waitOnExit) {
            if (typeof waitOnExit === 'string') {
                let message = waitOnExit;
                // Bold the message and add an extra new line to make it stand out from the rest of the output
                message = `\r\n\x1b[1m${message}\x1b[0m`;
                this.write(message);
            }
            this.attachPressEnterKeyToCloseListener(this.term);
            return;
        }
        this.dispose();
    }

    private attachPressEnterKeyToCloseListener(term: Terminal): void {
        if (term.textarea) {
            this.isAttachedCloseListener = true;
            this.addKeyListener(term.textarea, Key.ENTER, (event: KeyboardEvent) => {
                this.dispose();
                this.isAttachedCloseListener = false;
            });
        }
    }

    private disableEnterWhenAttachCloseListener(): boolean {
        return this.isAttachedCloseListener;
    }
}
