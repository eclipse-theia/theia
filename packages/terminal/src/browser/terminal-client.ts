/********************************************************************************
 * Copyright (C) 2019 Red Hat, Inc. and others.
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

import { injectable, inject, postConstruct, named } from 'inversify';
import { TerminalWidget } from './terminal-widget';
import { ShellTerminalServerProxy } from '../common/shell-terminal-protocol';
import { IBaseTerminalServer } from '../common/base-terminal-protocol';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { MessageConnection } from 'vscode-jsonrpc';
import { WebSocketConnectionProvider } from '@theia/core/lib/browser';
import { terminalsPath } from '../common/terminal-protocol';
import { TerminalWatcher } from '../common/terminal-watcher';
import { ILogger, Disposable, DisposableCollection, MaybePromise } from '@theia/core';

export const TerminalClient = Symbol('TerminalClient');
/**
 * TerminalClient contains connection logic between terminal server side and terminal widget. So it's incupsulated connection
 * specific logic in the separated code layer. Terminal widget responsible to render backend output and catch user input. Terminal client
 * responcible to create connection with backend, send output to the terminal widget, and send user input from terminal widget.
 * Terminal client should create connection with terminal server side and send user input from terminal widget to the terminal backend, move
 * terminal output from terminal backend to the terminal widget. Potentionally terminal backend could be separed service isolated of Theia.
 * This interface provide extensibility terminal wiget and terminal server side. This common interface allow to use different implementation
 * terminal widget for the same terminal backend. Also it's allow to reuse current terminal widget to comunication with some custom server side.
 */
export interface TerminalClient extends Disposable {

    /**
     * Terminal client options to setup server side terminal process
     * and control terminal client configuration.
     */
    readonly options: TerminalClientOptions;

    readonly widget: TerminalWidget;

    readonly terminalId: number;

    readonly processId: MaybePromise<number>

    /**
     * Create connection with terminal backend and return connection id.
     */
    create(): Promise<number>; // todo createAndAttach()

    attach(connectionId: number, createNewTerminalOnFail?: boolean): Promise<number>;

    resize(cols: number, rows: number): void;

    kill(): Promise<void>;

    sendText(text: string): Promise<void>;

}

export const TerminalClientOptions = Symbol('TerminalClientOptions');
export interface TerminalClientOptions { // I guess here should be used terminal based options?
    readonly closeOnDispose: boolean;
    readonly terminalDomId: string;
    /**
     * Path to the executable shell. For example: `/bin/bash`, `bash`, `sh`.
     */
    readonly shellPath?: string;

    /**
     * Shell arguments to executable shell, for example: [`-l`] - without login.
     */
    readonly shellArgs?: string[];

    /**
     * Current working directory.
     */
    readonly cwd?: string;

    /**
     * Environment variables for terminal.
     */
    readonly env?: { [key: string]: string | null };
}

// todo move implementation to the separated ts file.
/**
 * Default implementation Terminal Client.
 */
@injectable()
export class DefaultTerminalClient implements TerminalClient, Disposable {

    @inject(ShellTerminalServerProxy)
    protected readonly shellTerminalServer: ShellTerminalServerProxy;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(WebSocketConnectionProvider)
    protected readonly webSocketConnectionProvider: WebSocketConnectionProvider;

    @inject(TerminalWidget)
    readonly widget: TerminalWidget;

    @inject(TerminalClientOptions)
    readonly options: TerminalClientOptions;

    @inject(TerminalWatcher)
    protected readonly terminalWatcher: TerminalWatcher;

    @inject(ILogger) @named('terminal')
    protected readonly logger: ILogger;

    private _terminalId: number = -1;

    protected waitForConnection: Deferred<MessageConnection>;

    protected readonly toDispose = new DisposableCollection();
    protected readonly toDisposeOnConnect = new DisposableCollection();
    protected onDidCloseDisposable: Disposable;

    get processId(): Promise<number> {
        return (async () => {
            if (!IBaseTerminalServer.validateId(this.terminalId)) {
                throw new Error('terminal is not started');
            }
            return this.shellTerminalServer.getProcessId(this.terminalId);
        })();
    }

    get terminalId(): number {
        return this._terminalId;
    }

    @postConstruct()
    protected init(): void {
        this.toDispose.push(this.terminalWatcher.onTerminalError(({ terminalId, error }) => {
            if (terminalId === this.terminalId) {
                this.disposeWidget(); // todo use despose() at all?
                this.logger.error(`The terminal process terminated. Cause: ${error}`);
            }
        }));
        this.toDispose.push(this.terminalWatcher.onTerminalExit(({ terminalId }) => {
            if (terminalId === this.terminalId) {
                this.disposeWidget();
            }
        }));

       this.toDispose.push(this.widget);
       this.configureReconnection();
    }

    // Reconnection feature. Main idea - recreate json-rpc channel for terminal proxy,
    // and clean up previously created channel and related stuff.
    protected configureReconnection() {
        this.toDispose.push(this.shellTerminalServer.onDidCloseConnection(() => {
            const disposable = this.shellTerminalServer.onDidOpenConnection(() => {
                disposable.dispose();
                this.reconnectTerminalProcess();
            });
            this.toDispose.push(disposable);
        }));
    }

    protected async reconnectTerminalProcess(): Promise<void> {
        if (typeof this.terminalId === 'number') {
            await this.attach(this.terminalId);
        }
    }

    private disposeWidget(): void {
        if (this.onDidCloseDisposable) {
            this.onDidCloseDisposable.dispose();
        }
        if (this.options.closeOnDispose) {
            this.widget.dispose();
        }
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    async attach(id: number, createNewTerminalOnFaill?: boolean): Promise<number> {
        this._terminalId = await this.shellTerminalServer.attach(id);

        if (!IBaseTerminalServer.validateId(this.terminalId) && createNewTerminalOnFaill) {
            this.logger.error(`Error attaching to terminal id ${id}, the terminal is most likely gone. Starting up a new terminal instead.`);
            this._terminalId = await this.createProcess();
        }

        this.connectWidgetToProcess();
        return this.terminalId;
    }

    async create(): Promise<number> {
        this._terminalId = await this.createProcess();

        this.connectWidgetToProcess();

        return this.terminalId;
    }

    private connectWidgetToProcess() {
        this.connectTerminalProcess();
        this.onDidCloseDisposable = this.widget.onTerminalDidClose(() => this.kill());
        const onResizeDisposable = this.widget.onTerminalResize(size => this.resize(size.cols, size.rows));

        this.toDispose.pushAll([this.onDidCloseDisposable, onResizeDisposable]);
    }

    protected async createProcess(): Promise<number> {
        let rootURI = this.options.cwd;
        if (!rootURI) {
            const root = (await this.workspaceService.roots)[0];
            rootURI = root && root.uri;
        }

        const terminalId = await this.shellTerminalServer.create({
            ...this.options,
            cols: 80,
            rows: 24
        });
        if (IBaseTerminalServer.validateId(terminalId)) {
            return terminalId;
        }
        throw new Error('Error creating terminal widget, see the backend error log for more information.');
    }

     protected connectTerminalProcess(): void {
        if (!IBaseTerminalServer.validateId(this.terminalId)) {
            return;
        }

        this.toDisposeOnConnect.dispose();
        this.toDispose.push(this.toDisposeOnConnect);
        this.widget.reset();

        const waitForConnection = this.waitForConnection = new Deferred<MessageConnection>();
        this.webSocketConnectionProvider.listen({
            path: `${terminalsPath}/${this.terminalId}`,
            onConnection: connection => {
                connection.onNotification('onData', (data: string) => this.widget.write(data));

                this.toDisposeOnConnect.push(this.widget.onUserInput(data => data && connection.sendRequest('write', data)));
                this.toDisposeOnConnect.push(connection);

                connection.listen();
                if (waitForConnection) {
                    waitForConnection.resolve(connection);
                }
            }
        }, { reconnecting: false });
    }

    resize(cols: number, rows: number): void {
        if (!IBaseTerminalServer.validateId(this.terminalId)) {
            return;
        }

        this.shellTerminalServer.resize(this.terminalId, cols, rows);
    }

    async kill(): Promise<void> {
        console.log('kill terminal ', this.terminalId);
        await this.shellTerminalServer.close(this.terminalId);
    }

    async sendText(text: string): Promise<void> {
        if (this.waitForConnection) {
            this.waitForConnection.promise.then(connection =>
                connection.sendRequest('write', text)
            );
        }
    }
}
