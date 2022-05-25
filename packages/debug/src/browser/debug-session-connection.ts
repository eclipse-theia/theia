// *****************************************************************************
// Copyright (C) 2018 Red Hat, Inc. and others.
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

/* eslint-disable @typescript-eslint/no-explicit-any */

import { DebugProtocol } from 'vscode-debugprotocol';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { Event, Emitter, DisposableCollection, Disposable, MaybePromise, Channel } from '@theia/core';
import { OutputChannel } from '@theia/output/lib/browser/output-channel';

export interface DebugRequestTypes {
    'attach': [DebugProtocol.AttachRequestArguments, DebugProtocol.AttachResponse]
    'breakpointLocations': [DebugProtocol.BreakpointLocationsArguments, DebugProtocol.BreakpointLocationsResponse]
    'cancel': [DebugProtocol.CancelArguments, DebugProtocol.CancelResponse]
    'completions': [DebugProtocol.CompletionsArguments, DebugProtocol.CompletionsResponse]
    'configurationDone': [DebugProtocol.ConfigurationDoneArguments, DebugProtocol.ConfigurationDoneResponse]
    'continue': [DebugProtocol.ContinueArguments, DebugProtocol.ContinueResponse]
    'dataBreakpointInfo': [DebugProtocol.DataBreakpointInfoArguments, DebugProtocol.DataBreakpointInfoResponse]
    'disassemble': [DebugProtocol.DisassembleArguments, DebugProtocol.DisassembleResponse]
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
    'readMemory': [DebugProtocol.ReadMemoryArguments, DebugProtocol.ReadMemoryResponse]
    'restart': [DebugProtocol.RestartArguments, DebugProtocol.RestartResponse]
    'restartFrame': [DebugProtocol.RestartFrameArguments, DebugProtocol.RestartFrameResponse]
    'reverseContinue': [DebugProtocol.ReverseContinueArguments, DebugProtocol.ReverseContinueResponse]
    'scopes': [DebugProtocol.ScopesArguments, DebugProtocol.ScopesResponse]
    'setBreakpoints': [DebugProtocol.SetBreakpointsArguments, DebugProtocol.SetBreakpointsResponse]
    'setDataBreakpoints': [DebugProtocol.SetDataBreakpointsArguments, DebugProtocol.SetDataBreakpointsResponse]
    'setExceptionBreakpoints': [DebugProtocol.SetExceptionBreakpointsArguments, DebugProtocol.SetExceptionBreakpointsResponse]
    'setExpression': [DebugProtocol.SetExpressionArguments, DebugProtocol.SetExpressionResponse]
    'setFunctionBreakpoints': [DebugProtocol.SetFunctionBreakpointsArguments, DebugProtocol.SetFunctionBreakpointsResponse]
    'setInstructionBreakpoints': [DebugProtocol.SetInstructionBreakpointsArguments, DebugProtocol.SetInstructionBreakpointsResponse]
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
    'writeMemory': [DebugProtocol.WriteMemoryArguments, DebugProtocol.WriteMemoryResponse]
}

export interface DebugEventTypes {
    'breakpoint': DebugProtocol.BreakpointEvent
    'capabilities': DebugProtocol.CapabilitiesEvent
    'continued': DebugProtocol.ContinuedEvent
    'exited': DebugProtocol.ExitedEvent,
    'initialized': DebugProtocol.InitializedEvent
    'invalidated': DebugProtocol.InvalidatedEvent
    'loadedSource': DebugProtocol.LoadedSourceEvent
    'module': DebugProtocol.ModuleEvent
    'output': DebugProtocol.OutputEvent
    'process': DebugProtocol.ProcessEvent
    'progressEnd': DebugProtocol.ProgressEndEvent
    'progressStart': DebugProtocol.ProgressStartEvent
    'progressUpdate': DebugProtocol.ProgressUpdateEvent
    'stopped': DebugProtocol.StoppedEvent
    'terminated': DebugProtocol.TerminatedEvent
    'thread': DebugProtocol.ThreadEvent
}

export type DebugEventNames = keyof DebugEventTypes;

export namespace DebugEventTypes {
    export function isStandardEvent(evt: string): evt is DebugEventNames {
        return standardDebugEvents.has(evt);
    };
}

const standardDebugEvents = new Set<string>([
    'breakpoint',
    'capabilities',
    'continued',
    'exited',
    'initialized',
    'invalidated',
    'loadedSource',
    'module',
    'output',
    'process',
    'progressEnd',
    'progressStart',
    'progressUpdate',
    'stopped',
    'terminated',
    'thread'
]);

export type DebugRequestHandler = (request: DebugProtocol.Request) => MaybePromise<any>;

export class DebugSessionConnection implements Disposable {

    private sequence = 1;

    protected readonly pendingRequests = new Map<number, Deferred<DebugProtocol.Response>>();
    protected readonly connectionPromise: Promise<Channel>;

    protected readonly requestHandlers = new Map<string, DebugRequestHandler>();

    protected readonly onDidCustomEventEmitter = new Emitter<DebugProtocol.Event>();
    readonly onDidCustomEvent: Event<DebugProtocol.Event> = this.onDidCustomEventEmitter.event;

    protected readonly onDidCloseEmitter = new Emitter<void>();
    readonly onDidClose: Event<void> = this.onDidCloseEmitter.event;

    protected isClosed = false;

    protected readonly toDispose = new DisposableCollection(
        this.onDidCustomEventEmitter,
        Disposable.create(() => this.pendingRequests.clear()),
        Disposable.create(() => this.emitters.clear())
    );

    constructor(
        readonly sessionId: string,
        connectionFactory: (sessionId: string) => Promise<Channel>,
        protected readonly traceOutputChannel: OutputChannel | undefined
    ) {
        this.connectionPromise = this.createConnection(connectionFactory);
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

    protected async createConnection(connectionFactory: (sessionId: string) => Promise<Channel>): Promise<Channel> {
        const connection = await connectionFactory(this.sessionId);
        connection.onClose(() => {
            this.isClosed = true;
            this.cancelPendingRequests();
            this.onDidCloseEmitter.fire();
        });
        connection.onMessage(data => this.handleMessage(data().readString()));
        return connection;
    }

    protected allThreadsContinued = true;
    async sendRequest<K extends keyof DebugRequestTypes>(command: K, args: DebugRequestTypes[K][0], timeout?: number): Promise<DebugRequestTypes[K][1]> {
        const result = await this.doSendRequest(command, args, timeout);
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
    sendCustomRequest<T extends DebugProtocol.Response>(command: string, args?: any): Promise<T> {
        return this.doSendRequest<T>(command, args);
    }

    protected cancelPendingRequests(): void {
        this.pendingRequests.forEach((deferred, requestId) => {
            deferred.reject(new Error(`Request ${requestId} cancelled on connection close`));
        });
    }

    protected doSendRequest<K extends DebugProtocol.Response>(command: string, args?: any, timeout?: number): Promise<K> {
        const result = new Deferred<K>();

        if (this.isClosed) {
            result.reject(new Error('Connection is closed'));
        } else {
            const request: DebugProtocol.Request = {
                seq: this.sequence++,
                type: 'request',
                command: command,
                arguments: args
            };

            this.pendingRequests.set(request.seq, result);
            if (timeout) {
                const handle = setTimeout(() => {
                    const pendingRequest = this.pendingRequests.get(request.seq);
                    if (pendingRequest) {
                        // request has not been handled
                        this.pendingRequests.delete(request.seq);
                        const error: DebugProtocol.Response = {
                            type: 'response',
                            seq: 0,
                            request_seq: request.seq,
                            success: false,
                            command,
                            message: `Request #${request.seq}: ${request.command} timed out`
                        };
                        pendingRequest.reject(error);
                    }
                }, timeout);
                result.promise.finally(() => clearTimeout(handle));
            }
            this.send(request);
        }
        return result.promise;
    }

    protected async send(message: DebugProtocol.ProtocolMessage): Promise<void> {
        const connection = await this.connectionPromise;
        const messageStr = JSON.stringify(message);
        if (this.traceOutputChannel) {
            const now = new Date();
            const dateStr = `${now.toLocaleString(undefined, { hour12: false })}.${now.getMilliseconds()}`;
            this.traceOutputChannel.appendLine(`${this.sessionId.substring(0, 8)} ${dateStr} theia -> adapter: ${JSON.stringify(message, undefined, 4)}`);
        }
        connection.getWriteBuffer().writeString(messageStr).commit();
    }

    protected handleMessage(data: string): void {
        const message: DebugProtocol.ProtocolMessage = JSON.parse(data);
        if (this.traceOutputChannel) {
            const now = new Date();
            const dateStr = `${now.toLocaleString(undefined, { hour12: false })}.${now.getMilliseconds()}`;
            this.traceOutputChannel.appendLine(`${this.sessionId.substring(0, 8)} ${dateStr} theia <- adapter: ${JSON.stringify(message, undefined, 4)}`);
        }
        if (message.type === 'request') {
            this.handleRequest(message as DebugProtocol.Request);
        } else if (message.type === 'response') {
            this.handleResponse(message as DebugProtocol.Response);
        } else if (message.type === 'event') {
            this.handleEvent(message as DebugProtocol.Event);
        }
    }

    protected handleResponse(response: DebugProtocol.Response): void {
        const pendingRequest = this.pendingRequests.get(response.request_seq);
        if (pendingRequest) {
            this.pendingRequests.delete(response.request_seq);
            if (!response.success) {
                pendingRequest.reject(response);
            } else {
                pendingRequest.resolve(response);
            }
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
                response.body = await handler(request);
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
        if (event.event === 'continued') {
            this.allThreadsContinued = (<DebugProtocol.ContinuedEvent>event).body.allThreadsContinued === false ? false : true;
        }
        if (DebugEventTypes.isStandardEvent(event.event)) {
            this.doFire(event.event, event);
        } else {
            this.onDidCustomEventEmitter.fire(event);
        }
    }

    protected readonly emitters = new Map<string, Emitter<DebugProtocol.Event>>();
    on<K extends keyof DebugEventTypes>(kind: K, listener: (e: DebugEventTypes[K]) => any): Disposable {
        return this.getEmitter(kind).event(listener);
    }

    onEvent<K extends keyof DebugEventTypes>(kind: K): Event<DebugEventTypes[K]> {
        return this.getEmitter(kind).event;
    }

    protected fire<K extends keyof DebugEventTypes>(kind: K, e: DebugEventTypes[K]): void {
        this.doFire(kind, e);
    }
    protected doFire<K extends keyof DebugEventTypes>(kind: K, e: DebugEventTypes[K]): void {
        this.getEmitter(kind).fire(e);
    }
    protected getEmitter<K extends keyof DebugEventTypes>(kind: K): Emitter<DebugEventTypes[K]> {
        const emitter = this.emitters.get(kind) || this.newEmitter();
        this.emitters.set(kind, emitter);
        return <Emitter<DebugEventTypes[K]>>emitter;
    }
    protected newEmitter(): Emitter<DebugProtocol.Event> {
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
