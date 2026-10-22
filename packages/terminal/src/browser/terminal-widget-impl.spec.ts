// *****************************************************************************
// Copyright (C) 2026 STMicroelectronics and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
const disableJSDOM = enableJSDOM();
// Importing the widget pulls in xterm, which probes a canvas 2d context on load; JSDOM has no
// canvas backend, so stub it out to keep this spec runnable without the native `canvas` package.
(HTMLCanvasElement.prototype as unknown as { getContext: () => unknown }).getContext = () => undefined;

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import * as chai from 'chai';
import { Disposable, ILogger } from '@theia/core';
import { PanelLayout, Widget } from '@theia/core/lib/browser';
import { Channel } from '@theia/core/lib/common/message-rpc/channel';
import { ServiceConnectionProvider } from '@theia/core/lib/browser/messaging/service-connection-provider';
import { TerminalWidgetOptions } from './base/terminal-widget';
import { TerminalWidgetImpl } from './terminal-widget-impl';
import { TerminalSearchWidget } from './search/terminal-search-widget';
import { ShellTerminalServerProxy } from '../common/shell-terminal-protocol';
import { TerminalService } from './base/terminal-service';
import { TerminalPreferences } from '../common/terminal-preferences';

const expect = chai.expect;

/**
 * The widget with the collaborators of its start, connection and process queries replaced, so that
 * the deferral of the start can be exercised without xterm, a backend or a container.
 */
class TestTerminalWidget extends TerminalWidgetImpl {

    /** The ids passed to `start()`, `undefined` for a new terminal. */
    readonly startCalls: (number | undefined)[] = [];
    /** The ids passed to `attachTerminal()`. */
    readonly attachCalls: number[] = [];
    /** The text written to the connection, in order. */
    readonly sent: string[] = [];
    /** Whether the server was asked for child processes. */
    childProcessesQueried = false;

    protected nextTerminalId = 100;

    override options: TerminalWidgetOptions = {};

    protected override readonly logger = {
        warn: () => { },
        error: () => { }
    } as unknown as ILogger;

    protected override readonly terminalService = {
        getById: () => undefined
    } as unknown as TerminalService;

    protected override readonly preferences = {
        'terminal.integrated.enablePersistentSessions': true
    } as unknown as TerminalPreferences;

    protected override readonly shellTerminalServer = {
        onAttachAttempted: async () => { },
        getProcessId: async (id: number) => id + 1000,
        hasChildProcesses: async () => {
            this.childProcessesQueried = true;
            return true;
        },
        close: () => { }
    } as unknown as ShellTerminalServerProxy;

    protected override readonly connectionProvider = {
        listen: (_path: string, onConnection: (path: string, connection: Channel) => void) => {
            const connection = {
                onMessage: () => Disposable.NULL,
                onClose: () => Disposable.NULL,
                getWriteBuffer: () => ({
                    writeString: (text: string) => ({ commit: () => { this.sent.push(text); } })
                })
            } as unknown as Channel;
            onConnection(_path, connection);
        }
    } as unknown as ServiceConnectionProvider;

    constructor(kind: 'user' | string = 'user') {
        super();
        this.terminalKind = kind;
        this.searchBox = new Widget() as unknown as TerminalSearchWidget;
        this.term = {
            cols: 80,
            rows: 24,
            onData: () => Disposable.NULL,
            onBinary: () => Disposable.NULL
        } as unknown as TerminalWidgetImpl['term'];
    }

    override start(id?: number): Promise<number> {
        this.startCalls.push(id);
        return super.start(id);
    }

    protected override createTerminal(): Promise<number> {
        return Promise.resolve(this.nextTerminalId++);
    }

    protected override attachTerminal(id: number): Promise<number> {
        this.attachCalls.push(id);
        return Promise.resolve(this.nextTerminalId++);
    }

    protected override onUpdateRequest(): void {
        // no xterm to open
    }

    get pending(): string[] {
        return this.pendingText;
    }
}

/** Lets the asynchronous start and connection settle. */
const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

describe('TerminalWidgetImpl: deferred start', () => {

    let widget: TestTerminalWidget;
    let container: Widget;

    beforeEach(() => {
        container = new Widget();
        container.layout = new PanelLayout();
        Widget.attach(container, document.body);
    });

    afterEach(() => {
        Widget.detach(container);
        container.dispose();
    });

    /** Adds the widget to the container, which is attached and visible unless hidden before. */
    function add(w: Widget): void {
        (container.layout as PanelLayout).addWidget(w);
    }

    after(() => disableJSDOM());

    it('defers the start until the widget is shown', async () => {
        container.hide();
        widget = new TestTerminalWidget();
        add(widget);
        widget.startWhenShown();
        await settle();
        expect(widget.startCalls).to.deep.equal([]);
        expect(widget.terminalId).to.equal(-1);

        container.show();
        await settle();
        expect(widget.startCalls).to.deep.equal([undefined]);
        expect(widget.terminalId).to.equal(100);
    });

    it('starts right away when the widget is visible', async () => {
        widget = new TestTerminalWidget();
        add(widget);
        widget.startWhenShown();
        await settle();
        expect(widget.startCalls).to.deep.equal([undefined]);
    });

    it('starts a deferred terminal when it is attached to a visible parent', async () => {
        widget = new TestTerminalWidget();
        widget.startWhenShown();
        await settle();
        expect(widget.startCalls).to.deep.equal([]);

        add(widget);
        await settle();
        expect(widget.startCalls).to.deep.equal([undefined]);
    });

    it('starts a deferred terminal only once', async () => {
        container.hide();
        widget = new TestTerminalWidget();
        add(widget);
        widget.startWhenShown();
        container.show();
        container.hide();
        container.show();
        await settle();
        expect(widget.startCalls).to.deep.equal([undefined]);
    });

    it('reports no child processes while it is not started', async () => {
        container.hide();
        widget = new TestTerminalWidget();
        add(widget);
        widget.startWhenShown();
        expect(await widget.hasChildProcesses()).to.equal(false);
        expect(widget.childProcessesQueried).to.equal(false);

        container.show();
        await settle();
        expect(await widget.hasChildProcesses()).to.equal(true);
        expect(widget.childProcessesQueried).to.equal(true);
    });

    it('keeps text sent before it is connected and delivers it in order once it is', async () => {
        container.hide();
        widget = new TestTerminalWidget();
        add(widget);
        widget.startWhenShown();
        widget.sendText('first');
        widget.sendText('second');
        expect(widget.sent).to.deep.equal([]);
        expect(widget.pending).to.deep.equal(['first', 'second']);

        container.show();
        await settle();
        expect(widget.sent).to.deep.equal(['first', 'second']);
        expect(widget.pending).to.deep.equal([]);

        widget.sendText('third');
        await settle();
        expect(widget.sent).to.deep.equal(['first', 'second', 'third']);
    });

    it('drops text sent to a pseudo terminal that is not connected', () => {
        widget = new TestTerminalWidget();
        widget.options = { isPseudoTerminal: true };
        widget.sendText('ignored');
        expect(widget.pending).to.deep.equal([]);
    });

    it('restores a user terminal that was never started without starting it until shown', async () => {
        container.hide();
        widget = new TestTerminalWidget();
        add(widget);
        widget.restoreState({ terminalId: -1, titleLabel: 'Terminal' });
        await settle();
        expect(widget.startCalls).to.deep.equal([]);
        expect(widget.attachCalls).to.deep.equal([]);

        container.show();
        await settle();
        expect(widget.startCalls).to.deep.equal([undefined]);
    });

    it('restores a terminal with a process by attaching to it right away', async () => {
        container.hide();
        widget = new TestTerminalWidget();
        add(widget);
        widget.restoreState({ terminalId: 42, titleLabel: 'Terminal' });
        await settle();
        expect(widget.startCalls).to.deep.equal([42]);
        expect(widget.attachCalls).to.deep.equal([42]);
    });

    it('restores a terminal of another kind as before, attaching even without a process', async () => {
        container.hide();
        widget = new TestTerminalWidget('task');
        add(widget);
        widget.restoreState({ terminalId: -1, titleLabel: 'Task' });
        await settle();
        expect(widget.startCalls).to.deep.equal([-1]);
        expect(widget.attachCalls).to.deep.equal([-1]);
    });
});
