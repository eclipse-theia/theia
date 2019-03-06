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
import { Disposable, Event, Emitter, ILogger, DisposableCollection } from '@theia/core';
import { Widget, Message, StatefulWidget, isFirefox, MessageLoop, KeyCode } from '@theia/core/lib/browser';
import { isOSX } from '@theia/core/lib/common';
import { ThemeService } from '@theia/core/lib/browser/theming';
import { TerminalWidgetOptions, TerminalWidget, TerminalSize } from '@theia/terminal/lib/browser/terminal-widget';
import { TerminalPreferences } from './terminal-preferences';
import { TerminalClientFactory, TerminalClient, TerminalClientOptions } from '@theia/terminal/lib/browser';

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
    protected term: Xterm.Terminal;
    protected restored = false;
    protected closeOnDispose = true;

    @inject(TerminalWidgetOptions) options: TerminalWidgetOptions;
    @inject(ThemeService) protected readonly themeService: ThemeService;
    @inject(ILogger) @named('terminal') protected readonly logger: ILogger;
    @inject('terminal-dom-id') public readonly id: string;
    @inject(TerminalPreferences) protected readonly preferences: TerminalPreferences;

    @inject(TerminalClientFactory) terminalClientFactory: TerminalClientFactory;

    private terminalClient: TerminalClient;

    protected readonly _onTerminalDidClose = new Emitter<TerminalWidget>();
    protected readonly _onUserInput = new Emitter<string | undefined>();
    protected readonly _onTerminalResize = new Emitter<TerminalSize>();
    protected readonly onDidOpenEmitter = new Emitter<void>();
    readonly onDidOpen: Event<void> = this.onDidOpenEmitter.event;

    protected readonly toDispose = new DisposableCollection();

    @postConstruct()
    protected init(): void {
        const terminalClientOptions: TerminalClientOptions = {
            closeOnDispose: this.options.destroyTermOnClose,
            terminalDomId: this.id,
            cwd: this.options.cwd,
            env: this.options.env,
            shellArgs: this.options.shellArgs,
            shellPath: this.options.shellPath
        };
        this.terminalClient = this.terminalClientFactory(terminalClientOptions, this);
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
            theme: {
                foreground: cssProps.foreground,
                background: cssProps.background,
                cursor: cssProps.foreground,
                selection: cssProps.selection
            },
        });
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
        this.term.on('title', (title: string) => {
            if (this.options.useServerTitle) {
                this.title.label = title;
            }
        });
        this.term.on('data', data => this._onUserInput.fire(data));

        this.toDispose.push(this._onTerminalDidClose);
        this.toDispose.push(this.onDidOpenEmitter);
        this.toDispose.push(this._onUserInput);
    }

    async start(id?: number): Promise<number> { // todo depracte it ? make the same behavior like it was here...
        const terminalId = await this.terminalClient.create();
        this.onDidOpenEmitter.fire(undefined);
        return terminalId;
    }

    get processId(): Promise<number> {
        return this.terminalClient.processId;
    }

    async createProcess(): Promise<number> {
        const terminalId = await this.terminalClient.create();
        this.onDidOpenEmitter.fire(undefined);
        return terminalId;
    }

    async attach(processId: number, createNewProcessOnFail?: boolean): Promise<number> {
        const terminalId = await this.terminalClient.attach(processId, createNewProcessOnFail);
        this.onDidOpenEmitter.fire(undefined);
        return terminalId;
    }

    sendText(text: string): void {
        this.terminalClient.sendText(text);
    }

    clearOutput(): void {
        this.term.clear();
    }

    reset(): void {
        this.term.reset();
    }

    storeState(): object {
        this.closeOnDispose = false;
        // don't store if terminalId is -1;
        return { terminalId: this.terminalClient.terminalId, titleLabel: this.title.label };
    }

    restoreState(oldState: object) {
        if (this.restored === false) {
            const state = oldState as { terminalId: number, titleLabel: string };
            /* This is a workaround to issue #879 */
            this.restored = true;
            this.title.label = state.titleLabel;
            this.attach(state.terminalId);
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

            this._onTerminalResize.fire({cols: this.term.cols, rows: this.term.rows});
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
    write(data: string): void {
        if (this.termOpened) {
            this.term.write(data);
        } else {
            this.initialData += data;
        }
    }

    get onTerminalDidClose(): Event<TerminalWidget> {
        return this._onTerminalDidClose.event;
    }

    get onUserInput(): Event<string | undefined> {
        return this._onUserInput.event;
    }

    get onTerminalResize(): Event<TerminalSize> {
        return this._onTerminalResize.event;
    }

    dispose(): void {
        console.log('dispose terminal widget.');
        this._onTerminalDidClose.fire(this);
        this._onTerminalDidClose.dispose();
        super.dispose();
    }

    protected resizeTerminal(): void {
        const geo = proposeGeometry(this.term);
        const cols = geo.cols;
        const rows = geo.rows - 1; // subtract one row for margin
        this.term.resize(cols, rows);
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
