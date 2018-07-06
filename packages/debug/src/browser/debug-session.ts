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

import { injectable, inject, named } from "inversify";
import { Endpoint } from "@theia/core/lib/browser";
import {
    DebugAdapterPath,
    DebugConfiguration,
    DebugSessionState,
    DebugSessionStateAccumulator
} from "../common/debug-common";
import { DebugProtocol } from "vscode-debugprotocol";
import { Deferred } from "@theia/core/lib/common/promise-util";
import { Emitter, Event, DisposableCollection, ContributionProvider, Resource, ResourceResolver } from "@theia/core";
import { EventEmitter } from "events";
import { OutputChannelManager } from "@theia/output/lib/common/output-channel";
import { DebugSession, DebugSessionFactory, DebugSessionContribution } from "./debug-model";
import URI from "@theia/core/lib/common/uri";
import { BreakpointsApplier } from "./breakpoint/breakpoint-applier";

/**
 * Stack frame format.
 */
const DEFAULT_STACK_FRAME_FORMAT: DebugProtocol.StackFrameFormat = {
    parameters: true,
    parameterTypes: true,
    parameterNames: true,
    parameterValues: true,
    line: true,
    module: true,
    includeAll: true,
    hex: false
};

/**
 * Initialize requests arguments.
 */
const INITIALIZE_ARGUMENTS = {
    clientID: "Theia",
    locale: "",
    linesStartAt1: true,
    columnsStartAt1: true,
    pathFormat: "path",
    supportsVariableType: false,
    supportsVariablePaging: false,
    supportsRunInTerminalRequest: false
};

/**
 * DebugSession implementation.
 */
export class DebugSessionImpl extends EventEmitter implements DebugSession {
    protected readonly toDispose = new DisposableCollection();
    protected readonly callbacks = new Map<number, (response: DebugProtocol.Response) => void>();

    protected websocket: Promise<WebSocket>;

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

        websocket.onopen = () => initialized.resolve(websocket);
        websocket.onclose = () => this.onClose();
        websocket.onerror = () => initialized.reject(`Failed to establish connection with debug adapter by url: '${url}'`);
        websocket.onmessage = (event: MessageEvent): void => this.handleMessage(event);

        return initialized.promise;
    }

    initialize(args: DebugProtocol.InitializeRequestArguments): Promise<DebugProtocol.InitializeResponse> {
        return this.proceedRequest("initialize", args);
    }

    attach(args: DebugProtocol.AttachRequestArguments): Promise<DebugProtocol.AttachResponse> {
        return this.proceedRequest("attach", args);
    }

    launch(args: DebugProtocol.LaunchRequestArguments): Promise<DebugProtocol.LaunchResponse> {
        return this.proceedRequest("launch", args);
    }

    threads(): Promise<DebugProtocol.ThreadsResponse> {
        return this.proceedRequest("threads");
    }

    pauseAll(): Promise<DebugProtocol.PauseResponse[]> {
        return this.threads().then(response => Promise.all(response.body.threads.map((thread: DebugProtocol.Thread) => this.pause({ threadId: thread.id }))));
    }

    pause(args: DebugProtocol.PauseArguments): Promise<DebugProtocol.PauseResponse> {
        return this.proceedRequest("pause", args);
    }

    resumeAll(): Promise<DebugProtocol.ContinueResponse[]> {
        return this.threads().then(response => Promise.all(response.body.threads.map((thread: DebugProtocol.Thread) => this.resume({ threadId: thread.id }))));
    }

    resume(args: DebugProtocol.ContinueArguments): Promise<DebugProtocol.ContinueResponse> {
        return this.proceedRequest("continue", args);
    }

    stacks(args: DebugProtocol.StackTraceArguments): Promise<DebugProtocol.StackTraceResponse> {
        if (!args.format) {
            args.format = DEFAULT_STACK_FRAME_FORMAT;
        }
        return this.proceedRequest("stackTrace", args);
    }

    configurationDone(): Promise<DebugProtocol.ConfigurationDoneResponse> {
        return this.proceedRequest("configurationDone");
    }

    disconnect(): Promise<DebugProtocol.DisconnectResponse> {
        return this.proceedRequest("disconnect", { terminateDebuggee: true });
    }

    scopes(args: DebugProtocol.ScopesArguments): Promise<DebugProtocol.ScopesResponse> {
        return this.proceedRequest("scopes", args);
    }

    variables(args: DebugProtocol.VariablesArguments): Promise<DebugProtocol.VariablesResponse> {
        return this.proceedRequest('variables', args);
    }

    setVariable(args: DebugProtocol.SetVariableArguments): Promise<DebugProtocol.SetVariableResponse> {
        return this.proceedRequest('setVariable', args);
    }

    evaluate(args: DebugProtocol.EvaluateArguments): Promise<DebugProtocol.EvaluateResponse> {
        return this.proceedRequest('evaluate', args);
    }

    source(args: DebugProtocol.SourceArguments): Promise<DebugProtocol.SourceResponse> {
        return this.proceedRequest('source', args);
    }

    setBreakpoints(args: DebugProtocol.SetBreakpointsArguments): Promise<DebugProtocol.SetBreakpointsResponse> {
        return this.proceedRequest('setBreakpoints', args);
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
        const callback = this.callbacks.get(response.request_seq);
        if (callback) {
            this.callbacks.delete(response.request_seq);
            callback(response);
        }
    }

    protected proceedEvent(event: DebugProtocol.Event): void {
        this.emit(event.event, event);
    }

    protected onClose(): void {
        if (this.state.isConnected) {
            const event: DebugProtocol.TerminatedEvent = {
                event: 'terminated',
                type: 'event',
                seq: -1,
            };
            this.proceedEvent(event);
        }
    }

    dispose() {
        this.callbacks.clear();
        this.websocket
            .then(websocket => websocket.close())
            .catch(error => console.error(error));
    }
}

@injectable()
export class DefaultDebugSessionFactory implements DebugSessionFactory {
    get(sessionId: string, debugConfiguration: DebugConfiguration): DebugSession {
        const state: DebugSessionState = {
            isConnected: false,
            sources: new Map<string, DebugProtocol.Source>(),
            stoppedThreadIds: new Set<number>(),
            allThreadsContinued: false,
            allThreadsStopped: false,
            capabilities: {}
        };
        return new DebugSessionImpl(sessionId, debugConfiguration, state);
    }
}

/** It is intended to manage active debug sessions. */
@injectable()
export class DebugSessionManager {
    private activeDebugSessionId: string | undefined;

    protected readonly sessions = new Map<string, DebugSession>();
    protected readonly contribs = new Map<string, DebugSessionContribution>();
    protected readonly onDidPreCreateDebugSessionEmitter = new Emitter<string>();
    protected readonly onDidCreateDebugSessionEmitter = new Emitter<DebugSession>();
    protected readonly onDidChangeActiveDebugSessionEmitter = new Emitter<[DebugSession | undefined, DebugSession | undefined]>();
    protected readonly onDidDestroyDebugSessionEmitter = new Emitter<DebugSession>();

    constructor(
        @inject(DebugSessionFactory) protected readonly debugSessionFactory: DebugSessionFactory,
        @inject(OutputChannelManager) protected readonly outputChannelManager: OutputChannelManager,
        @inject(ContributionProvider) @named(DebugSessionContribution) protected readonly contributions: ContributionProvider<DebugSessionContribution>,
        @inject(BreakpointsApplier) protected readonly breakpointApplier: BreakpointsApplier) {

        for (const contrib of this.contributions.getContributions()) {
            this.contribs.set(contrib.debugType, contrib);
        }
    }

    /**
     * Creates a new [debug session](#DebugSession).
     * @param sessionId The session identifier
     * @param configuration The debug configuration
     * @returns The debug session
     */
    create(sessionId: string, debugConfiguration: DebugConfiguration): DebugSession {
        this.onDidPreCreateDebugSessionEmitter.fire(sessionId);

        const contrib = this.contribs.get(debugConfiguration.type);
        const sessionFactory = contrib ? contrib.debugSessionFactory() : this.debugSessionFactory;
        const session = sessionFactory.get(sessionId, debugConfiguration);
        this.sessions.set(sessionId, session);

        this.onDidCreateDebugSessionEmitter.fire(session);

        const channel = this.outputChannelManager.getChannel(debugConfiguration.name);
        session.on("output", event => {
            const outputEvent = (event as DebugProtocol.OutputEvent);
            channel.appendLine(outputEvent.body.output);
        });
        session.on("initialized", () => this.setActiveDebugSession(sessionId));
        session.on("terminated", () => this.destroy(sessionId));

        const initializeArgs: DebugProtocol.InitializeRequestArguments = {
            ...INITIALIZE_ARGUMENTS,
            adapterID: debugConfiguration.type
        };

        session.initialize(initializeArgs)
            .then(() => {
                const request = debugConfiguration.request;
                switch (request) {
                    case "attach": {
                        const attachArgs: DebugProtocol.AttachRequestArguments = Object.assign(debugConfiguration, { __restart: false });
                        return session.attach(attachArgs);
                    }
                    default: return Promise.reject(`Unsupported request '${request}' type.`);
                }
            })
            .then(() => this.breakpointApplier.applySessionBreakpoints(session))
            .then(() => session.configurationDone());

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
        const oldActiveSessionSession = this.activeDebugSessionId ? this.find(this.activeDebugSessionId) : undefined;

        if (this.activeDebugSessionId !== sessionId) {
            this.activeDebugSessionId = sessionId;
            this.onDidChangeActiveDebugSessionEmitter.fire([oldActiveSessionSession, this.getActiveDebugSession()]);
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

    get onDidChangeActiveDebugSession(): Event<[DebugSession | undefined, DebugSession | undefined]> {
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

/**
 * DAP resource.
 */
export const DAP_SCHEME = 'dap';

export class DebugResource implements Resource {

    constructor(
        public uri: URI,
        protected readonly debugSessionManager: DebugSessionManager,
    ) { }

    dispose(): void { }

    readContents(options: { encoding?: string }): Promise<string> {
        const debugSession = this.debugSessionManager.getActiveDebugSession();
        if (!debugSession) {
            throw new Error(`There is no active debug session to load content '${this.uri}'`);
        }

        const sourceReference = this.uri.query;
        if (sourceReference) {
            return debugSession.source({ sourceReference: Number.parseInt(sourceReference) }).then(response => response.body.content);
        }

        const path = this.uri.path.toString();
        const source = debugSession.state.sources.get(path);
        if (!source) {
            throw new Error(`There is no loaded source for '${this.uri}'`);
        }

        if (!source.sourceReference) {
            throw new Error(`sourceReference isn't specified '${this.uri}'`);
        }

        return debugSession.source({ sourceReference: source.sourceReference }).then(response => response.body.content);
    }
}

@injectable()
export class DebugResourceResolver implements ResourceResolver {

    constructor(
        @inject(DebugSessionManager)
        protected readonly debugSessionManager: DebugSessionManager
    ) { }

    resolve(uri: URI): DebugResource {
        if (uri.scheme !== DAP_SCHEME) {
            throw new Error('The given URI is not a valid dap uri: ' + uri);
        }

        return new DebugResource(uri, this.debugSessionManager);
    }
}
