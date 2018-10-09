/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

// tslint:disable:no-any

import { WebSocketConnectionProvider } from '@theia/core/lib/browser';
import { DebugProtocol } from 'vscode-debugprotocol';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { Emitter, Event, DisposableCollection, Disposable } from '@theia/core';
import { WebSocketChannel } from '@theia/core/lib/common/messaging/web-socket-channel';
import { DebugAdapterPath } from '../common/debug-service';

export interface DebugExitEvent {
    code?: number
    reason?: string | Error
}

export type DebugRequestHandler = (request: DebugProtocol.Request) => any;

export interface DebugRequestTypes {
    'attach': [DebugProtocol.AttachRequestArguments, DebugProtocol.AttachResponse]
    'completions': [DebugProtocol.CompletionsArguments, DebugProtocol.CompletionsResponse]
    'configurationDone': [DebugProtocol.ConfigurationDoneArguments, DebugProtocol.ConfigurationDoneResponse]
    'continue': [DebugProtocol.ContinueArguments, DebugProtocol.ContinueResponse]
    'disconnect': [DebugProtocol.DisconnectArguments, DebugProtocol.DisconnectResponse]
    'evaluate': [DebugProtocol.EvaluateArguments, DebugProtocol.EvaluateResponse]
    'exceptionInfo': [DebugProtocol.ExceptionInfoArguments, DebugProtocol.ExceptionInfoResponse]
    'goto': [DebugProtocol.GotoArguments, DebugProtocol.GotoResponse]
    'gotoTargets': [DebugProtocol.GotoTargetsArguments, DebugProtocol.GotoTargetsResponse]
    'initialize': [DebugProtocol.InitializeRequestArguments, DebugProtocol.InitializeResponse]
    'launch': [DebugProtocol.LaunchRequestArguments, DebugProtocol.LaunchResponse]
    'loadedSources': [DebugProtocol.LoadedSourcesArguments, DebugProtocol.LoadedSourcesResponse]
    'modules': [DebugProtocol.ModulesArguments, DebugProtocol.ModulesResponse]
    'next': [DebugProtocol.NextArguments, DebugProtocol.NextResponse]
    'pause': [DebugProtocol.PauseArguments, DebugProtocol.PauseResponse]
    'restart': [DebugProtocol.RestartArguments, DebugProtocol.RestartResponse]
    'restartFrame': [DebugProtocol.RestartFrameArguments, DebugProtocol.RestartFrameResponse]
    'reverseContinue': [DebugProtocol.ReverseContinueArguments, DebugProtocol.ReverseContinueResponse]
    'scopes': [DebugProtocol.ScopesArguments, DebugProtocol.ScopesResponse]
    'setBreakpoints': [DebugProtocol.SetBreakpointsArguments, DebugProtocol.SetBreakpointsResponse]
    'setExceptionBreakpoints': [DebugProtocol.SetExceptionBreakpointsArguments, DebugProtocol.SetExceptionBreakpointsResponse]
    'setExpression': [DebugProtocol.SetExpressionArguments, DebugProtocol.SetExpressionResponse]
    'setFunctionBreakpoints': [DebugProtocol.SetFunctionBreakpointsArguments, DebugProtocol.SetFunctionBreakpointsResponse]
    'setVariable': [DebugProtocol.SetVariableArguments, DebugProtocol.SetVariableResponse]
    'source': [DebugProtocol.SourceArguments, DebugProtocol.SourceResponse]
    'stackTrace': [DebugProtocol.StackTraceArguments, DebugProtocol.StackTraceResponse]
    'stepBack': [DebugProtocol.StepBackArguments, DebugProtocol.StepBackResponse]
    'stepIn': [DebugProtocol.StepInArguments, DebugProtocol.StepInResponse]
    'stepInTargets': [DebugProtocol.StepInTargetsArguments, DebugProtocol.StepInTargetsResponse]
    'stepOut': [DebugProtocol.StepOutArguments, DebugProtocol.StepOutResponse]
    'terminate': [DebugProtocol.TerminateArguments, DebugProtocol.TerminateResponse]
    'terminateThreads': [DebugProtocol.TerminateThreadsArguments, DebugProtocol.TerminateThreadsResponse]
    'threads': [{}, DebugProtocol.ThreadsResponse]
    'variables': [DebugProtocol.VariablesArguments, DebugProtocol.VariablesResponse]
}

export interface DebugEventTypes {
    'breakpoint': DebugProtocol.BreakpointEvent
    'capabilities': DebugProtocol.CapabilitiesEvent
    'continued': DebugProtocol.ContinuedEvent
    'exited': DebugExitEvent
    'initialized': DebugProtocol.InitializedEvent
    'loadedSource': DebugProtocol.LoadedSourceEvent
    'module': DebugProtocol.ModuleEvent
    'output': DebugProtocol.OutputEvent
    'process': DebugProtocol.ProcessEvent
    'stopped': DebugProtocol.StoppedEvent
    'terminated': DebugProtocol.TerminatedEvent
    'thread': DebugProtocol.ThreadEvent
}

export class DebugSessionConnection implements Disposable {

    private sequence = 1;

    protected readonly pendingRequests = new Map<number, (response: DebugProtocol.Response) => void>();
    protected readonly connection: Promise<WebSocketChannel>;

    protected readonly onDidEventEmitter = new Emitter<DebugProtocol.Event | DebugExitEvent>();
    readonly onDidEvent: Event<DebugProtocol.Event | DebugExitEvent> = this.onDidEventEmitter.event;

    protected readonly requestHandlers = new Map<string, DebugRequestHandler>();

    protected readonly toDispose = new DisposableCollection(
        this.onDidEventEmitter,
        Disposable.create(() => this.pendingRequests.clear()),
        Disposable.create(() => this.emitters.clear())
    );

    constructor(
        readonly sessionId: string,
        protected readonly connectionProvider: WebSocketConnectionProvider
    ) {
        this.connection = this.createConnection();
    }

    get disposed(): boolean {
        return this.toDispose.disposed;
    }
    protected checkDisposed(): void {
        if (this.disposed) {
            throw new Error('the debug session connection is disposed, id: ' + this.sessionId);
        }
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    protected createConnection(): Promise<WebSocketChannel> {
        return new Promise<WebSocketChannel>(resolve =>
            this.connectionProvider.openChannel(`${DebugAdapterPath}/${this.sessionId}`, channel => {
                if (this.disposed) {
                    channel.close();
                } else {
                    const closeChannel = this.toDispose.push(Disposable.create(() => channel.close()));
                    channel.onClose((code, reason) => {
                        closeChannel.dispose();
                        this.onDidEventEmitter.fire({ code, reason });
                    });
                    channel.onMessage(data => this.handleMessage(data));
                    resolve(channel);
                }
            }, { reconnecting: false })
        );
    }

    protected allThreadsContinued = true;
    async sendRequest<K extends keyof DebugRequestTypes>(command: K, args: DebugRequestTypes[K][0]): Promise<DebugRequestTypes[K][1]> {
        const result = await this.doSendRequest(command, args);
        if (command === 'next' || command === 'stepIn' ||
            command === 'stepOut' || command === 'stepBack' ||
            command === 'reverseContinue' || command === 'restartFrame') {
            this.fireContinuedEvent((args as any).threadId);
        }
        if (command === 'continue') {
            const response = result as DebugProtocol.ContinueResponse;
            const allThreadsContinued = response && response.body && response.body.allThreadsContinued;
            if (allThreadsContinued !== undefined) {
                this.allThreadsContinued = result.body.allThreadsContinued;
            }
            this.fireContinuedEvent((args as any).threadId, this.allThreadsContinued);
            return result;
        }
        return result;
    }
    protected async doSendRequest<K extends keyof DebugRequestTypes>(command: K, args: DebugRequestTypes[K][0]): Promise<DebugRequestTypes[K][1]> {
        const result = new Deferred<DebugRequestTypes[K][1]>();

        const request: DebugProtocol.Request = {
            seq: this.sequence++,
            type: 'request',
            command: command,
            arguments: args
        };

        this.pendingRequests.set(request.seq, (response: DebugRequestTypes[K][1]) => {
            if (!response.success) {
                result.reject(response);
            } else {
                result.resolve(response);
            }
        });

        await this.send(request);
        return result.promise;
    }

    protected async send(message: DebugProtocol.ProtocolMessage): Promise<void> {
        const connection = await this.connection;
        connection.send(JSON.stringify(message));
    }

    protected handleMessage(data: string) {
        const message: DebugProtocol.ProtocolMessage = JSON.parse(data);
        if (message.type === 'request') {
            this.handleRequest(message as DebugProtocol.Request);
        } else if (message.type === 'response') {
            this.handleResponse(message as DebugProtocol.Response);
        } else if (message.type === 'event') {
            this.handleEvent(message as DebugProtocol.Event);
        }
    }

    protected handleResponse(response: DebugProtocol.Response): void {
        const callback = this.pendingRequests.get(response.request_seq);
        if (callback) {
            this.pendingRequests.delete(response.request_seq);
            callback(response);
        }
    }

    onRequest(command: string, handler: DebugRequestHandler): void {
        this.requestHandlers.set(command, handler);
    }

    protected async handleRequest(request: DebugProtocol.Request): Promise<void> {
        const response: DebugProtocol.Response = {
            type: 'response',
            seq: 0,
            command: request.command,
            request_seq: request.seq,
            success: true,
        };
        const handler = this.requestHandlers.get(request.command);
        if (handler) {
            try {
                response.body = handler(request);
            } catch (error) {
                response.success = false;
                response.message = error.message;
            }
        } else {
            console.error('Unhandled request', request);
        }
        await this.send(response);
    }

    protected handleEvent(event: DebugProtocol.Event): void {
        if ('event' in event) {
            if (event.event === 'continued') {
                this.allThreadsContinued = (<DebugProtocol.ContinuedEvent>event).body.allThreadsContinued === false ? false : true;
            }
            this.fireCustom(event.event, event);
        } else {
            this.fire('exited', event);
        }
    }

    protected readonly emitters = new Map<string, Emitter<DebugProtocol.Event | DebugExitEvent>>();
    on<K extends keyof DebugEventTypes>(kind: K, listener: (e: DebugEventTypes[K]) => any): Disposable {
        return this.onCustom(kind, listener);
    }
    onCustom<E extends DebugProtocol.Event>(kind: string, listener: (e: E) => any): Disposable {
        return this.getEmitter(kind).event(listener);
    }
    protected fire<K extends keyof DebugEventTypes>(kind: K, e: DebugEventTypes[K]): void {
        this.fireCustom(kind, e);
    }
    protected fireCustom<K extends keyof DebugEventTypes>(kind: string, e: DebugEventTypes[K]): void {
        this.getEmitter(kind).fire(e);
        this.onDidEventEmitter.fire(e);
    }
    protected getEmitter(kind: string): Emitter<DebugProtocol.Event | DebugExitEvent> {
        const emitter = this.emitters.get(kind) || this.newEmitter();
        this.emitters.set(kind, emitter);
        return emitter;
    }
    protected newEmitter(): Emitter<DebugProtocol.Event | DebugExitEvent> {
        const emitter = new Emitter();
        this.checkDisposed();
        this.toDispose.push(emitter);
        return emitter;
    }

    protected fireContinuedEvent(threadId: number, allThreadsContinued = false): void {
        this.fire('continued', {
            type: 'event',
            event: 'continued',
            body: {
                threadId,
                allThreadsContinued
            },
            seq: -1
        });
    }

}
