/*
 * Copyright (C) 2018 Red Hat, Inc.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v1.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v10.html
 *
 * Contributors:
 *   Red Hat, Inc. - initial API and implementation
 */

import { injectable, inject } from "inversify";
import { Endpoint } from "@theia/core/lib/browser";
import { DebugAdapterPath, DebugConfiguration, DebugSessionState, ExtDebugProtocol } from "../common/debug-model";
import { DebugProtocol } from "vscode-debugprotocol";
import { Disposable } from "vscode-jsonrpc";
import { Deferred } from "@theia/core/lib/common/promise-util";
import { Emitter, Event, DisposableCollection } from "@theia/core";
import { EventEmitter } from "events";
import { OutputChannelManager } from "@theia/output/lib/common/output-channel";

export const DebugSession = Symbol("DebugSession");

export interface DebugSession extends Disposable, NodeJS.EventEmitter {
    readonly sessionId: string;
    readonly configuration: DebugConfiguration;
    readonly state: DebugSessionState;

    getServerCapabilities(): DebugProtocol.Capabilities | undefined;
    initialize(): Promise<DebugProtocol.InitializeResponse>;
    configurationDone(): Promise<DebugProtocol.ConfigurationDoneResponse>;
    attach(args: DebugProtocol.AttachRequestArguments): Promise<DebugProtocol.AttachResponse>;
    launch(args: DebugProtocol.LaunchRequestArguments): Promise<DebugProtocol.LaunchResponse>;
    threads(): Promise<DebugProtocol.ThreadsResponse>;
    stacks(threadId: number): Promise<DebugProtocol.StackTraceResponse>;
    pause(threadId: number): Promise<DebugProtocol.PauseResponse>;
    pauseAll(): Promise<DebugProtocol.PauseResponse[]>;
    resume(threadId: number): Promise<DebugProtocol.ContinueResponse>;
    resumeAll(): Promise<DebugProtocol.ContinueResponse[]>;
    disconnect(): Promise<DebugProtocol.InitializeResponse>;
    scopes(frameId: number): Promise<DebugProtocol.ScopesResponse>;
    variables(variablesReference: number, start?: number, count?: number): Promise<DebugProtocol.VariablesResponse>;
    setVariable(args: DebugProtocol.SetVariableArguments): Promise<DebugProtocol.SetVariableResponse>;
    evaluate(frameId: number, expression: string, context?: string): Promise<DebugProtocol.EvaluateResponse>;
}

/**
 * DebugSession implementation.
 */
export class DebugSessionImpl extends EventEmitter implements DebugSession {
    protected readonly toDispose = new DisposableCollection();
    protected readonly callbacks = new Map<number, (response: DebugProtocol.Response) => void>();

    protected websocket: Promise<WebSocket>;
    protected capabilities: DebugProtocol.Capabilities = {};

    private sequence: number;

    constructor(
        public readonly sessionId: string,
        public readonly configuration: DebugConfiguration,
        public readonly state: DebugSessionState) {

        super();
        this.state = new DebugSessionStateAccumulator(this, state);
        this.websocket = this.createWebSocket();
        this.sequence = 1;
    }

    private createWebSocket(): Promise<WebSocket> {
        const path = DebugAdapterPath + "/" + this.sessionId;
        const url = new Endpoint({ path }).getWebSocketUrl().toString();
        const websocket = new WebSocket(url);

        const initialized = new Deferred<WebSocket>();

        websocket.onopen = () => {
            initialized.resolve(websocket);
        };
        websocket.onclose = () => { };
        websocket.onerror = () => {
            initialized.reject(`Failed to establish connection with debug adapter by url: '${url}'`);
        };
        websocket.onmessage = (event: MessageEvent): void => {
            this.handleMessage(event);
        };

        return initialized.promise;
    }

    initialize(): Promise<DebugProtocol.InitializeResponse> {
        return this.proceedRequest("initialize", {
            clientID: "Theia",
            clientName: "Theia",
            adapterID: this.configuration.type,
            locale: "",
            linesStartAt1: true,
            columnsStartAt1: true,
            pathFormat: "path",
            supportsVariableType: false,
            supportsVariablePaging: false,
            supportsRunInTerminalRequest: false
        }).then((response: DebugProtocol.InitializeResponse) => {
            this.capabilities = response.body || {};
            return response;
        });
    }

    attach(args: DebugProtocol.AttachRequestArguments): Promise<DebugProtocol.AttachResponse> {
        return this.proceedRequest("attach", args)
            .then(response => {
                this.emit("connected");
                return response;
            });
    }

    launch(args: DebugProtocol.LaunchRequestArguments): Promise<DebugProtocol.LaunchResponse> {
        return this.proceedRequest("launch", args)
            .then(response => {
                this.emit("connected");
                return response;
            });
    }

    threads(): Promise<DebugProtocol.ThreadsResponse> {
        return this.proceedRequest("threads");
    }

    pauseAll(): Promise<DebugProtocol.PauseResponse[]> {
        return this.threads().then(response => Promise.all(response.body.threads.map((thread: DebugProtocol.Thread) => this.pause(thread.id))));
    }

    pause(threadId: number): Promise<DebugProtocol.PauseResponse> {
        return this.proceedRequest("pause", { threadId });
    }

    resumeAll(): Promise<DebugProtocol.ContinueResponse[]> {
        return this.threads().then(response => Promise.all(response.body.threads.map((thread: DebugProtocol.Thread) => this.resume(thread.id))));
    }

    resume(threadId: number): Promise<DebugProtocol.ContinueResponse> {
        return this.proceedRequest("continue", { threadId }).then(response => {
            const event: DebugProtocol.ContinuedEvent = {
                type: 'event',
                seq: -1,
                event: 'continued',
                body: {
                    threadId,
                    allThreadsContinued: false
                }
            };
            this.proceedEvent(event);
            return response as DebugProtocol.ContinueResponse;
        });
    }

    stacks(threadId: number): Promise<DebugProtocol.StackTraceResponse> {
        const args: DebugProtocol.StackTraceArguments = {
            threadId,
            startFrame: 0,
            format: {
                parameters: true,
                parameterTypes: true,
                parameterNames: true,
                parameterValues: true,
                line: true,
                module: true,
                includeAll: true
            }
        };

        return this.proceedRequest("stackTrace", args);
    }

    configurationDone(): Promise<DebugProtocol.ConfigurationDoneResponse> {
        return this.proceedRequest("configurationDone");
    }

    getServerCapabilities(): DebugProtocol.Capabilities {
        return this.capabilities;
    }

    disconnect(): Promise<DebugProtocol.DisconnectResponse> {
        return this.proceedRequest("disconnect", { terminateDebuggee: true });
    }

    scopes(frameId: number): Promise<DebugProtocol.ScopesResponse> {
        return this.proceedRequest("scopes", { frameId });
    }

    variables(variablesReference: number, start?: number, count?: number): Promise<DebugProtocol.VariablesResponse> {
        const args: DebugProtocol.VariablesArguments = {
            variablesReference, start, count,
            format: { hex: false }
        };
        return this.proceedRequest('variables', args);
    }

    setVariable(args: DebugProtocol.SetVariableArguments): Promise<DebugProtocol.SetVariableResponse> {
        return this.proceedRequest('setVariable', args).then(response => {
            const event: ExtDebugProtocol.ExtVariableUpdatedEvent = {
                type: 'event',
                seq: -1,
                event: 'variableUpdated',
                body: {
                    ...response.body,
                    name: args.name,
                    parentVariablesReference: args.variablesReference,
                }
            };
            this.proceedEvent(event);
            return response as DebugProtocol.SetVariableResponse;
        });
    }

    evaluate(frameId: number, expression: string, context?: string): Promise<DebugProtocol.EvaluateResponse> {
        const args: DebugProtocol.EvaluateArguments = {
            frameId, expression, context,
            format: { hex: false }
        };
        return this.proceedRequest('evaluate', args);
    }

    protected handleMessage(event: MessageEvent) {
        const message: DebugProtocol.ProtocolMessage = JSON.parse(event.data);
        if (message.type === 'response') {
            this.proceedResponse(message as DebugProtocol.Response);
        } else if (message.type === 'event') {
            this.proceedEvent(message as DebugProtocol.Event);
        }
    }

    protected proceedRequest<T extends DebugProtocol.Response>(command: string, args?: {}): Promise<T> {
        const result = new Deferred<T>();

        const request: DebugProtocol.Request = {
            seq: this.sequence++,
            type: "request",
            command: command,
            arguments: args
        };

        this.callbacks.set(request.seq, (response: T) => {
            if (!response.success) {
                result.reject(response);
            } else {
                result.resolve(response);
            }
        });

        return this.websocket
            .then(websocket => websocket.send(JSON.stringify(request)))
            .then(() => result.promise);
    }

    protected proceedResponse(response: DebugProtocol.Response): void {
        console.log(response);
        const callback = this.callbacks.get(response.request_seq);
        if (callback) {
            this.callbacks.delete(response.request_seq);
            callback(response);
        }
    }

    protected proceedEvent(event: DebugProtocol.Event): void {
        this.emit(event.event, event);
    }

    dispose() {
        this.callbacks.clear();
        this.websocket
            .then(websocket => websocket.close())
            .catch(error => console.error(error));
    }
}

@injectable()
export class DebugSessionFactory {
    get(sessionId: string, debugConfiguration: DebugConfiguration): DebugSession {
        const state: DebugSessionState = {
            isConnected: false,
            breakpoints: [],
            stoppedThreadIds: [],
            allThreadsContinued: false,
            allThreadsStopped: false
        };
        return new DebugSessionImpl(sessionId, debugConfiguration, state);
    }
}

/** It is intended to manage active debug sessions. */
@injectable()
export class DebugSessionManager {
    private activeDebugSessionId: string | undefined;

    protected readonly sessions = new Map<string, DebugSession>();
    protected readonly onDidPreCreateDebugSessionEmitter = new Emitter<string>();
    protected readonly onDidCreateDebugSessionEmitter = new Emitter<DebugSession>();
    protected readonly onDidChangeActiveDebugSessionEmitter = new Emitter<DebugSession | undefined>();
    protected readonly onDidDestroyDebugSessionEmitter = new Emitter<DebugSession>();

    constructor(
        @inject(DebugSessionFactory)
        protected readonly debugSessionFactory: DebugSessionFactory,
        @inject(OutputChannelManager)
        protected readonly outputChannelManager: OutputChannelManager
    ) { }

    /**
     * Creates a new [debug session](#DebugSession).
     * @param sessionId The session identifier
     * @param configuration The debug configuration
     * @returns The debug session
     */
    create(sessionId: string, debugConfiguration: DebugConfiguration): DebugSession {
        this.onDidPreCreateDebugSessionEmitter.fire(sessionId);

        const session = this.debugSessionFactory.get(sessionId, debugConfiguration);
        this.sessions.set(sessionId, session);

        this.onDidCreateDebugSessionEmitter.fire(session);

        const channel = this.outputChannelManager.getChannel(debugConfiguration.name);
        session.on("output", event => {
            const outputEvent = (event as DebugProtocol.OutputEvent);
            channel.appendLine(outputEvent.body.output);
        });
        session.on("initialized", () => this.setActiveDebugSession(sessionId));
        session.on("terminated", () => this.destroy(sessionId));

        session.initialize()
            .then(response => {
                const request = debugConfiguration.request;
                switch (request) {
                    case "attach": {
                        const args: DebugProtocol.AttachRequestArguments = Object.assign(debugConfiguration, { __restart: false });
                        return session.attach(args);
                    }
                    default: return Promise.reject(`Unsupported request '${request}' type.`);
                }
            })
            .then(response => session.configurationDone());

        return session;
    }

    /**
     * Removes the [debug session](#DebugSession).
     * @param sessionId The session identifier
     */
    remove(sessionId: string): void {
        this.sessions.delete(sessionId);
        if (this.activeDebugSessionId) {
            if (this.activeDebugSessionId === sessionId) {
                if (this.sessions.size !== 0) {
                    this.setActiveDebugSession(this.sessions.keys().next().value);
                } else {
                    this.setActiveDebugSession(undefined);
                }
            }
        }
    }

    /**
     * Finds a debug session by its identifier.
     * @returns The debug sessions
     */
    find(sessionId: string): DebugSession | undefined {
        return this.sessions.get(sessionId);
    }

    /**
     * Finds all instantiated debug sessions.
     * @returns An array of debug sessions
     */
    findAll(): DebugSession[] {
        return Array.from(this.sessions.values());
    }

    /**
     * Sets the active debug session.
     * @param sessionId The session identifier
     */
    setActiveDebugSession(sessionId: string | undefined) {
        if (this.activeDebugSessionId !== sessionId) {
            this.activeDebugSessionId = sessionId;
            this.onDidChangeActiveDebugSessionEmitter.fire(this.getActiveDebugSession());
        }
    }

    /**
     * Returns the active debug session.
     * @returns the [debug session](#DebugSession)
     */
    getActiveDebugSession(): DebugSession | undefined {
        if (this.activeDebugSessionId) {
            return this.sessions.get(this.activeDebugSessionId);
        }
    }

    /**
     * Destroy the debug session. If session identifier isn't provided then
     * all active debug session will be destroyed.
     * @param sessionId The session identifier
     */
    destroy(sessionId?: string): void {
        if (sessionId) {
            const session = this.sessions.get(sessionId);
            if (session) {
                this.doDestroy(session);
            }
        } else {
            this.sessions.forEach(session => this.doDestroy(session));
        }
    }

    private doDestroy(session: DebugSession): void {
        session.dispose();
        this.remove(session.sessionId);
        this.onDidDestroyDebugSessionEmitter.fire(session);
    }

    get onDidChangeActiveDebugSession(): Event<DebugSession | undefined> {
        return this.onDidChangeActiveDebugSessionEmitter.event;
    }

    get onDidPreCreateDebugSession(): Event<string> {
        return this.onDidPreCreateDebugSessionEmitter.event;
    }

    get onDidCreateDebugSession(): Event<DebugSession> {
        return this.onDidCreateDebugSessionEmitter.event;
    }

    get onDidDestroyDebugSession(): Event<DebugSession> {
        return this.onDidDestroyDebugSessionEmitter.event;
    }
}

class DebugSessionStateAccumulator implements DebugSessionState {
    private _isConnected: boolean;
    private _allThreadsContinued: boolean | undefined;
    private _allThreadsStopped: boolean | undefined;
    private _stoppedThreads: Set<number>;
    private _breakpoints = new Map<string, DebugProtocol.Breakpoint>();

    constructor(
        protected readonly debugSession: DebugSession,
        protected readonly currentState: DebugSessionState) {
        this._isConnected = currentState.isConnected;
        this._allThreadsContinued = currentState.allThreadsContinued;
        this._allThreadsStopped = currentState.allThreadsStopped;
        this._stoppedThreads = new Set(currentState.stoppedThreadIds);
        currentState.breakpoints.forEach(breakpoint => this._breakpoints.set(this.createId(breakpoint), breakpoint));

        this.debugSession.on("connected", () => this.onConnectedEvent());
        this.debugSession.on("terminated", () => this.onTerminatedEvent());
        this.debugSession.on('stopped', event => this.onStoppedEvent(event));
        this.debugSession.on('continued', event => this.onContinuedEvent(event));
        this.debugSession.on('thread', event => this.onThreadEvent(event));
        this.debugSession.on('breakpoint', event => this.onBreakpointEvent(event));
    }

    get allThreadsContinued(): boolean | undefined {
        return this._allThreadsContinued;
    }

    get allThreadsStopped(): boolean | undefined {
        return this._allThreadsStopped;
    }

    get isConnected(): boolean {
        return this._isConnected;
    }

    get stoppedThreadIds(): number[] {
        return Array.from(this._stoppedThreads);
    }

    get breakpoints(): DebugProtocol.Breakpoint[] {
        return Array.from(this._breakpoints.values());
    }

    private onConnectedEvent(): void {
        this._isConnected = true;
    }

    private onTerminatedEvent(): void {
        this._isConnected = false;
    }

    private onContinuedEvent(event: DebugProtocol.ContinuedEvent): void {
        const body = event.body;

        this._allThreadsContinued = body.allThreadsContinued;
        if (this._allThreadsContinued) {
            this._stoppedThreads.clear();
        } else {
            this._stoppedThreads.delete(body.threadId);
        }
    }

    private onStoppedEvent(event: DebugProtocol.StoppedEvent): void {
        const body = event.body;

        this._allThreadsStopped = body.allThreadsStopped;
        if (body.threadId) {
            this._stoppedThreads.add(body.threadId);
        }
    }

    private onThreadEvent(event: DebugProtocol.ThreadEvent): void {
        switch (event.body.reason) {
            case 'exited': {
                this._stoppedThreads.delete(event.body.threadId);
                break;
            }
        }
    }

    private onBreakpointEvent(event: DebugProtocol.BreakpointEvent): void {
        const breakpoint = event.body.breakpoint;
        switch (event.body.reason) {
            case 'new': {
                this._breakpoints.set(this.createId(breakpoint), breakpoint);
                break;
            }
            case 'removed': {
                this._breakpoints.delete(this.createId(breakpoint));
                break;
            }
            case 'changed': {
                this._breakpoints.set(this.createId(breakpoint), breakpoint);
                break;
            }
        }
    }

    private createId(breakpoint: DebugProtocol.Breakpoint): string {
        return breakpoint.id
            ? breakpoint.id.toString()
            : (breakpoint.source ? `${breakpoint.source.path}-` : '')
            + (`${breakpoint.line}: ${breakpoint.column} `);
    }
}
