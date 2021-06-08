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

import { ContributionProvider, Disposable, DisposableCollection, Emitter, Event, ILogger } from '@theia/core';
import { isFirefox, KeyCode, Message, MessageLoop, PreferenceChangeEvent, StatefulWidget, Widget } from '@theia/core/lib/browser';
import { Key } from '@theia/core/lib/browser/keys';
import { isOSX } from '@theia/core/lib/common';
import URI from '@theia/core/lib/common/uri';
import { inject, injectable, named, postConstruct } from '@theia/core/shared/inversify';
import { CommandLineOptions, ShellCommandBuilder } from '@theia/process/lib/common/shell-command-builder';
import { TerminalDataEvent, TerminalExitEvent, TerminalProcessInfo } from '@theia/process/lib/node';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { RendererType, Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { IShellTerminalPreferences } from '../common/shell-terminal-protocol';
import { TerminalService } from './base/terminal-service';
import { TerminalDimensions, TerminalWidget, TerminalWidgetOptions } from './base/terminal-widget';
import { AttachedRemoteTerminal, RemoteTerminal } from './remote-terminal';
import { RemoteTerminalService } from './remote-terminal-service';
import { TerminalSearchWidget, TerminalSearchWidgetFactory } from './search/terminal-search-widget';
import { TerminalContribution } from './terminal-contribution';
import { TerminalCopyOnSelectionHandler } from './terminal-copy-on-selection-handler';
import { CursorStyle, DEFAULT_TERMINAL_RENDERER_TYPE, isTerminalRendererType, TerminalPreferences, TerminalRendererType } from './terminal-preferences';
import { TerminalThemeService } from './terminal-theme-service';

export const TERMINAL_WIDGET_FACTORY_ID = 'terminal';

// Device status code emitted by Xterm.js
// Check: https://github.com/xtermjs/xterm.js/blob/release/3.14/src/InputHandler.ts#L1055-L1082
export const DEVICE_STATUS_CODES = new Set(['\u001B[>0;276;0c', '\u001B[>85;95;0c', '\u001B[>83;40003;0c', '\u001B[?1;2c', '\u001B[?6c']);

export interface TerminalWidgetFactoryOptions extends Partial<TerminalWidgetOptions> {
    /* a unique string per terminal */
    created: string
}

export interface TerminalWidgetImplState {
    terminalId?: number
    titleLabel: string
}

@injectable()
export class TerminalWidgetImpl extends TerminalWidget implements StatefulWidget {

    @inject(TerminalWidgetOptions) options: TerminalWidgetOptions;

    protected toDisposeOnConnect = new DisposableCollection();

    protected terminalKind = 'user';
    protected fitAddon: FitAddon;
    protected term: Terminal;
    protected searchBox: TerminalSearchWidget;
    protected killed = false;
    protected killOnDispose = true;
    protected hoverMessage: HTMLDivElement;
    protected lastTouchEnd: TouchEvent | undefined;
    protected isAttachedCloseListener: boolean = false;
    protected needsResize = true;
    protected termOpened = false;
    protected initialData = '';

    protected remoteTerminalPromise: Promise<RemoteTerminal>;
    protected remoteTerminal?: RemoteTerminal;

    protected onDidTermCloseEmitter = new Emitter<TerminalWidget>();
    protected onDidOpenEmitter = new Emitter<void>();
    protected onDidOpenFailureEmitter = new Emitter<void>();
    protected onDidSizeChangeEmitter = new Emitter<{ cols: number; rows: number; }>();
    protected onDataEmitter = new Emitter<string>();

    @inject('terminal-dom-id') public id: string;

    @inject(WorkspaceService) protected workspaceService: WorkspaceService;
    @inject(ILogger) @named('terminal') protected logger: ILogger;
    @inject(TerminalPreferences) protected preferences: TerminalPreferences;
    @inject(ContributionProvider) @named(TerminalContribution) protected terminalContributionProvider: ContributionProvider<TerminalContribution>;
    @inject(TerminalService) protected terminalService: TerminalService;
    @inject(TerminalSearchWidgetFactory) protected terminalSearchBoxFactory: TerminalSearchWidgetFactory;
    @inject(TerminalCopyOnSelectionHandler) protected copyOnSelectionHandler: TerminalCopyOnSelectionHandler;
    @inject(TerminalThemeService) protected themeService: TerminalThemeService;
    @inject(ShellCommandBuilder) protected shellCommandBuilder: ShellCommandBuilder;
    @inject(RemoteTerminalService) protected remoteTerminalService: RemoteTerminalService;

    @postConstruct()
    protected init(): void {
        this.addClass('terminal-container');
        this.setTitle(this.options.title || 'Terminal');
        this.title.iconClass = 'fa fa-terminal';
        this.title.closable = true;
        if (this.options.kind) {
            this.terminalKind = this.options.kind;
        }
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
        if (this.options.destroyTermOnClose === true) {
            this.toDispose.push(this.term);
        }
        this.fitAddon = new FitAddon();
        this.term.loadAddon(this.fitAddon);
        this.hoverMessage = document.createElement('div');
        this.hoverMessage.textContent = 'Cmd + click to follow link';
        this.hoverMessage.style.position = 'fixed';
        // TODO use `var(--theia-editorHoverWidget-foreground) with a newer Monaco version
        this.hoverMessage.style.color = 'var(--theia-editorWidget-foreground)';
        this.hoverMessage.style.backgroundColor = 'var(--theia-editorHoverWidget-background)';
        this.hoverMessage.style.borderColor = 'var(--theia-editorHoverWidget-border)';
        this.hoverMessage.style.borderWidth = '0.5px';
        this.hoverMessage.style.borderStyle = 'solid';
        this.hoverMessage.style.padding = '5px';
        // Above the xterm.js canvas layers:
        // https://github.com/xtermjs/xterm.js/blob/ff790236c1b205469f17a21246141f512d844295/src/renderer/Renderer.ts#L41-L46
        this.hoverMessage.style.zIndex = '10';
        // Initially invisible:
        this.hoverMessage.style.display = 'none';
        this.node.appendChild(this.hoverMessage);
        this.toDispose.pushAll([
            // Emitters
            this.onDidTermCloseEmitter,
            this.onDidOpenEmitter,
            this.onDidOpenFailureEmitter,
            this.onDidSizeChangeEmitter,
            this.onDataEmitter,
            // Other
            this.toDisposeOnConnect,
            // Theia events
            this.preferences.onPreferenceChanged(change => this.onTerminalPreferenceChanged(change)),
            this.themeService.onDidChange(() => this.term.setOption('theme', this.themeService.theme)),
            // Xterm.js events
            this.term.onTitleChange(title => {
                if (this.options.useServerTitle) {
                    this.title.label = title;
                }
            }),
            this.term.onSelectionChange(() => {
                if (this.copyOnSelection) {
                    this.copyOnSelectionHandler.copy(this.term.getSelection());
                }
            }),
            this.term.onResize(data => { this.onDidSizeChangeEmitter.fire(data); }),
            this.term.onData(data => { this.onDataEmitter.fire(data); }),
        ]);
        this.attachCustomKeyEventHandler();
        if (!this.options.isPseudoTerminal) {
            this.remoteTerminalPromise = this.createRemoteTerminal()
                .then(rt => this.remoteTerminal = rt);
        }
        const touchEndListener = (event: TouchEvent) => {
            if (this.node.contains(event.target as Node)) {
                this.lastTouchEnd = event;
            }
        };
        document.addEventListener('touchend', touchEndListener, { passive: true });
        this.onDispose(() => {
            document.removeEventListener('touchend', touchEndListener);
        });
        for (const contribution of this.terminalContributionProvider.getContributions()) {
            contribution.onCreate(this);
        }
        this.searchBox = this.terminalSearchBoxFactory(this.term);
        this.toDispose.push(this.searchBox);
    }

    get onTerminalDidClose(): Event<TerminalWidget> {
        return this.onDidTermCloseEmitter.event;
    }

    get onDidOpen(): Event<void> {
        return this.onDidOpenEmitter.event;
    }

    get onDidOpenFailure(): Event<void> {
        return this.onDidOpenFailureEmitter.event;
    }

    get onSizeChanged(): Event<{ cols: number; rows: number; }> {
        return this.onDidSizeChangeEmitter.event;
    }

    get onData(): Event<string> {
        return this.onDataEmitter.event;
    }

    get kind(): 'user' | string {
        return this.terminalKind;
    }

    get dimensions(): TerminalDimensions {
        return {
            cols: this.term.cols,
            rows: this.term.rows,
        };
    }

    get cwd(): Promise<URI> {
        return this.getAttachedRemoteTerminal()
            .then(
                rt => new URI(rt.info.cwd),
                error => new URI()
            );
    }

    get processId(): Promise<number> {
        return this.getAttachedRemoteTerminal()
            .then(rt => rt.info.pid);
    }

    get processInfo(): Promise<TerminalProcessInfo> {
        return this.getAttachedRemoteTerminal()
            .then(rt => rt.info);
    }

    /**
     * `0` means we are not yet attached.
     *
     * Positive values mean we are attached to a remote terminal.
     *
     * Negative values are reserved for "pseudo terminals".
     */
    get terminalId(): number {
        if (this.remoteTerminal?.isAttached()) {
            return this.remoteTerminal.terminalId;
        }
        return 0;
    }

    get lastTouchEndEvent(): TouchEvent | undefined {
        return this.lastTouchEnd;
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

    getTerminal(): Terminal {
        return this.term;
    }

    getSearchBox(): TerminalSearchWidget {
        return this.searchBox;
    }

    onDispose(onDispose: () => void): void {
        this.toDispose.push(Disposable.create(onDispose));
    }

    clearOutput(): void {
        this.term.clear();
    }

    async hasChildProcesses(): Promise<boolean> {
        return this.shellTerminalServer.hasChildProcesses(await this.processId);
    }

    /**
     * Create a new shell terminal in the back-end and attach it to a new terminal widget.
     *
     * If `terminalId` is provided attach to it.
     */
    async start(terminalId?: number): Promise<number> {
        try {
            const terminal = terminalId === undefined
                ? await this.spawnRemoteTerminal()
                : await this.attachRemoteTerminal(terminalId);
            return terminal.terminalId;
        } catch (error) {
            this.onDidOpenFailureEmitter.fire(undefined);
            console.error(`Failed to start terminal${terminalId ? ` for id: ${terminalId}.` : '.'}`);
            throw error;
        }
    }

    storeState(): TerminalWidgetImplState | undefined {
        // The frontend is going away so we need to prevent the logic
        // that would kill the remote terminal when the current TerminalWidget
        // get disposed (like when a user manually closes its widget by hand).
        this.killOnDispose = false;
        if (this.options.isPseudoTerminal || this._terminalId === undefined) {
            return;
        }
        return {
            terminalId: this.terminalId,
            titleLabel: this.title.label,
        };
    }

    restoreState(state: TerminalWidgetImplState): void {
        if (this.options.isPseudoTerminal) {
            // Maybe some Theia applications store pseudo terminal widgets
            // as part of their layout still, so we need to dispose those.
            // TODO: remove at some point
            this.dispose();
        } else {
            this.title.label = state.titleLabel;
            this.start(state.terminalId);
        }
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
        this.remoteTerminalPromise.then(rt => {
            // is it an issue to call sendText before connecting/attaching the terminal?
            rt.proxy.write(text);
        });
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
            this.kill();
            this.attachPressEnterKeyToCloseListener(this.term);
            return;
        }
        this.dispose();
    }

    dispose(): void {
        // Close the backend terminal only when explicitly closing the terminal
        // a refresh for example won't close it.
        if (this.killOnDispose) {
            this.kill();
            this.onDidTermCloseEmitter.fire(this);
        }
        super.dispose();
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

    protected get copyOnSelection(): boolean {
        return this.preferences['terminal.integrated.copyOnSelection'];
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
        Widget.attach(this.searchBox, this.node);
        super.onAfterAttach(msg);
        this.update();
    }

    protected onBeforeDetach(msg: Message): void {
        Widget.detach(this.searchBox);
        super.onBeforeDetach(msg);
    }

    protected onResize(msg: Widget.ResizeMessage): void {
        super.onResize(msg);
        this.needsResize = true;
        this.update();
    }

    protected async spawnRemoteTerminal(): Promise<AttachedRemoteTerminal> {
        if (this.options.isPseudoTerminal) {
            throw new Error('I don\'t understand this option...');
        }
        const terminal = await this.remoteTerminalPromise;
        let rootURI = this.options.cwd?.toString();
        if (!rootURI) {
            const root = (await this.workspaceService.roots)[0];
            rootURI = root?.resource?.toString();
        }
        return this.remoteTerminalService.spawn(terminal, {
            persist: true,
            executable: 'bash',
            shellPreferences: this.shellPreferences,
            shell: this.options.shellPath,
            args: this.options.shellArgs,
            env: this.sanitizeEnv(this.options.env),
            isPseudo: this.options.isPseudoTerminal,
            rootURI,
            cols: this.term.cols,
            rows: this.term.rows
        });
    }

    protected async attachRemoteTerminal(terminalId: number): Promise<AttachedRemoteTerminal> {
        if (this.options.isPseudoTerminal) {
            throw new Error('I don\'t understand this option...');
        }
        const terminal = await this.remoteTerminalPromise;
        return this.remoteTerminalService.attach(terminal, { terminalId });
    }

    protected sanitizeEnv(env?: Record<string, string | null | undefined>): Record<string, string> | undefined {
        if (!env) {
            return;
        }
        return Object.fromEntries(Object.entries(env).filter(
            ([key, value]) => typeof value === 'string' && value.length > 0
        ) as [string, string][]);
    }

    protected kill(): void {
        this.killAsync();
    }

    protected async killAsync(): Promise<void> {
        if (!this.killed) {
            this.killed = true;
            const terminal = await this.remoteTerminalPromise;
            await terminal.proxy.kill();
        }
    }

    protected onTerminalPreferenceChanged(change: PreferenceChangeEvent<TerminalPreferences>): void {
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
            this.term.setOption(preferenceName, preferenceValue);
            this.needsResize = true;
            this.update();
        }
    }

    protected onAttachedRemoteTerminalExit(status: TerminalExitEvent): void {
        this.dispose();
        this.onDidTermCloseEmitter.fire(this);
        this.onDidTermCloseEmitter.dispose();
    }

    protected onAttachedRemoteTerminalData(data: TerminalDataEvent): void {
        this.write(data);
    }

    protected onXtermData(data: string): void {
        // exclude the device status codes emitted by Xterm.js
        if (data && !this.isDeviceStatusCode(data) && !this.disableEnterWhenAttachCloseListener()) {
            this.remoteTerminal!.proxy.write(data);
        }
    }

    protected async createRemoteTerminal(): Promise<RemoteTerminal> {
        try {
            const rt = await this.remoteTerminalService.create();
            if (this.toDispose.disposed) {
                rt.dispose();
            } else {
                this.toDispose.pushAll([
                    rt,
                    rt.proxy.onExit(status => this.onAttachedRemoteTerminalExit(status)),
                    // receive remote output into xterm output
                    rt.proxy.onData(data => this.onAttachedRemoteTerminalData(data)),
                    // send xterm's input to remote input
                    this.term.onData(data => this.onXtermData(data)),
                ]);
            }
            return rt;
        } catch (error) {
            this.dispose();
            this.onDidTermCloseEmitter.fire(this);
            this.onDidTermCloseEmitter.dispose();
            this.logger.error('could not create RemoteTerminal');
            throw error;
        }
    }

    protected onUpdateRequest(msg: Message): void {
        super.onUpdateRequest(msg);
        if (!this.isVisible || !this.isAttached) {
            return;
        }
        this.open();
        if (this.needsResize) {
            this.resizeXtermToFit();
            this.needsResize = false;
            this.resizeRemoteTerminal();
        }
    }

    protected isDeviceStatusCode(data: string): boolean {
        return DEVICE_STATUS_CODES.has(data);
    }

    // protected async reconnectTerminalProcess(): Promise<void> {
    //     if (this.options.isPseudoTerminal) {
    //         return;
    //     }
    //     if (typeof this.terminalId === 'number') {
    //         await this.start(this.terminalId);
    //     }
    // }

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
            if (this.term.element) {
                (this.term.element.children.item(0) as HTMLElement).style.overflow = 'hidden';
            }
        }
    }

    protected resizeXtermToFit(): void {
        const { rows, cols } = this.fitAddon.proposeDimensions();
        // subtract one row for margin
        this.term.resize(cols, rows - 1);
    }

    protected resizeRemoteTerminal(): void {
        if (this.options.isPseudoTerminal) {
            return;
        }
        this.getAttachedRemoteTerminal()
            .then(terminal => terminal.proxy.resize(this.term.cols, this.term.rows));
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

    /**
     * Throws if the current remote terminal is not attached.
     */
    protected async getAttachedRemoteTerminal(): Promise<AttachedRemoteTerminal> {
        const terminal = await this.remoteTerminalPromise;
        return RemoteTerminal.ensureAttached(terminal);
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
