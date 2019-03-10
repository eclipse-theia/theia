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
import { ShellTerminalServerProxy } from '../common/shell-terminal-protocol';
import { IBaseTerminalServer } from '../common/base-terminal-protocol';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { MessageConnection } from 'vscode-jsonrpc';
import { WebSocketConnectionProvider } from '@theia/core/lib/browser';
import { terminalsPath } from '../common/terminal-protocol';
import { TerminalWatcher } from '../common/terminal-watcher';
import { ILogger, Disposable, DisposableCollection } from '@theia/core';
import { TerminalClient, TerminalWidget, TerminalClientOptions } from './';

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
                this.dispose();
                this.logger.error(`The terminal process terminated. Cause: ${error}`);
            }
        }));
        this.toDispose.push(this.terminalWatcher.onTerminalExit(({ terminalId }) => {
            if (terminalId === this.terminalId) {
                this.dispose();
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
            this._terminalId = await this.attach(this.terminalId);
        }
    }

    dispose(): void {
        this.toDispose.dispose();
        if (this.options.closeOnDispose) {
            this.widget.dispose();
        }
    }

    async attach(id: number, createNewTerminalOnFaill?: boolean): Promise<number> {
        this._terminalId = await this.shellTerminalServer.attach(id);

        if (!IBaseTerminalServer.validateId(this.terminalId) && createNewTerminalOnFaill) {
            this.logger.error(`Error attaching to terminal id ${id}, the terminal is most likely gone. Starting up a new terminal instead.`);
            this._terminalId = await this.spawnProcess();
        }

        this.connectWidgetToProcess();

        return this.terminalId;
    }

    async createAndAttach(): Promise<number> {
        this._terminalId = await this.spawnProcess();

        this.connectWidgetToProcess();

        return this.terminalId;
    }

    private connectWidgetToProcess() {
        this.createConnection();
        this.onDidCloseDisposable = this.widget.onTerminalDidClose(() => this.kill());
        const onResizeDisposable = this.widget.onTerminalResize(size => this.resize(size.cols, size.rows));

        this.toDispose.pushAll([this.onDidCloseDisposable, onResizeDisposable]);
    }

    protected async spawnProcess(): Promise<number> {
        let rootURI = this.options.rootURI;
        if (!rootURI) {
            const root = (await this.workspaceService.roots)[0];
            rootURI = root && root.uri;
        }

        const terminalId = await this.shellTerminalServer.create({
            ... this.options,
            cols: this.options.cols || 80,
            rows: this.options.rows || 24,
        });

        if (IBaseTerminalServer.validateId(terminalId)) {
            return terminalId;
        }
        throw new Error('Error creating terminal widget, see the backend error log for more information.');
    }

    /**
     * Create connection to the process
     */
     protected createConnection(): void {
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

    async resize(cols: number, rows: number): Promise<void> {
        if (!IBaseTerminalServer.validateId(this.terminalId)) {
            return;
        }

        await this.shellTerminalServer.resize(this.terminalId, cols, rows);
    }

    async kill(): Promise<void> {
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
