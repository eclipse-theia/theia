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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/* eslint-disable @typescript-eslint/no-explicit-any */

import * as React from '@theia/core/shared/react';
import { LabelProvider } from '@theia/core/lib/browser';
import { DebugProtocol } from '@vscode/debugprotocol';
import { Emitter, Event, DisposableCollection, Disposable, MessageClient, MessageType, Mutable, ContributionProvider } from '@theia/core/lib/common';
import { TerminalService } from '@theia/terminal/lib/browser/base/terminal-service';
import { EditorManager } from '@theia/editor/lib/browser';
import { CompositeTreeElement } from '@theia/core/lib/browser/source-tree';
import { DebugSessionConnection, DebugRequestTypes, DebugEventTypes } from './debug-session-connection';
import { DebugThread, StoppedDetails, DebugThreadData } from './model/debug-thread';
import { DebugScope } from './console/debug-console-items';
import { DebugStackFrame } from './model/debug-stack-frame';
import { DebugSource } from './model/debug-source';
import { DebugBreakpoint, DebugBreakpointOptions } from './model/debug-breakpoint';
import { DebugSourceBreakpoint } from './model/debug-source-breakpoint';
import debounce = require('p-debounce');
import URI from '@theia/core/lib/common/uri';
import { BreakpointManager } from './breakpoint/breakpoint-manager';
import { DebugConfigurationSessionOptions, InternalDebugSessionOptions, TestRunReference } from './debug-session-options';
import { DebugConfiguration, DebugConsoleMode } from '../common/debug-common';
import { SourceBreakpoint, ExceptionBreakpoint } from './breakpoint/breakpoint-marker';
import { TerminalWidgetOptions, TerminalWidget } from '@theia/terminal/lib/browser/base/terminal-widget';
import { DebugFunctionBreakpoint } from './model/debug-function-breakpoint';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { DebugContribution } from './debug-contribution';
import { Deferred, waitForEvent } from '@theia/core/lib/common/promise-util';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { DebugInstructionBreakpoint } from './model/debug-instruction-breakpoint';
import { nls } from '@theia/core';
import { TestService, TestServices } from '@theia/test/lib/browser/test-service';
import { DebugSessionManager } from './debug-session-manager';

export enum DebugState {
    Inactive,
    Initializing,
    Running,
    Stopped
}
/**
 * The mapped string values must not change as they are used for the `debugState` when context closure.
 * For more details see the `Debugger contexts` section of the [official doc](https://code.visualstudio.com/api/references/when-clause-contexts#available-contexts).
 */
export function debugStateContextValue(state: DebugState): string {
    switch (state) {
        case DebugState.Initializing: return 'initializing';
        case DebugState.Stopped: return 'stopped';
        case DebugState.Running: return 'running';
        default: return 'inactive';
    }
}

const formatMessageRegexp = /\{([^}]+)\}/g;

/**
 * Returns a formatted message string. The format is compatible with {@link DebugProtocol.Message.format}.
 * @param format A format string for the message. Embedded variables have the form `{name}`.
 * @param variables An object used as a dictionary for looking up the variables in the format string.
 */
export function formatMessage(format: string, variables?: { [key: string]: string; }): string {
    return variables ? format.replace(formatMessageRegexp, (match, group) => variables.hasOwnProperty(group) ? variables[group] : match) : format;
}

// FIXME: make injectable to allow easily inject services
export class DebugSession implements CompositeTreeElement {
    protected readonly deferredOnDidConfigureCapabilities = new Deferred<void>();

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;
    protected fireDidChange(): void {
        this.onDidChangeEmitter.fire(undefined);
    }
    protected readonly onDidFocusStackFrameEmitter = new Emitter<DebugStackFrame | undefined>();
    get onDidFocusStackFrame(): Event<DebugStackFrame | undefined> {
        return this.onDidFocusStackFrameEmitter.event;
    }

    protected readonly onDidFocusThreadEmitter = new Emitter<DebugThread | undefined>();
    get onDidFocusThread(): Event<DebugThread | undefined> {
        return this.onDidFocusThreadEmitter.event;
    }

    protected readonly onDidChangeBreakpointsEmitter = new Emitter<URI>();
    readonly onDidChangeBreakpoints: Event<URI> = this.onDidChangeBreakpointsEmitter.event;
    protected fireDidChangeBreakpoints(uri: URI): void {
        this.onDidChangeBreakpointsEmitter.fire(uri);
    }

    protected readonly childSessions = new Map<string, DebugSession>();
    protected readonly toDispose = new DisposableCollection();

    protected isStopping: boolean = false;

    constructor(
        readonly id: string,
        readonly options: DebugConfigurationSessionOptions,
        readonly parentSession: DebugSession | undefined,
        testService: TestService,
        testRun: TestRunReference | undefined,
        sessionManager: DebugSessionManager,
        protected readonly connection: DebugSessionConnection,
        protected readonly terminalServer: TerminalService,
        protected readonly editorManager: EditorManager,
        protected readonly breakpoints: BreakpointManager,
        protected readonly labelProvider: LabelProvider,
        protected readonly messages: MessageClient,
        protected readonly fileService: FileService,
        protected readonly debugContributionProvider: ContributionProvider<DebugContribution>,
        protected readonly workspaceService: WorkspaceService,
        /**
         * Number of millis after a `stop` request times out. It's 5 seconds by default.
         */
        protected readonly stopTimeout = 5_000,
    ) {
        this.connection.onRequest('runInTerminal', (request: DebugProtocol.RunInTerminalRequest) => this.runInTerminal(request));
        this.connection.onDidClose(() => {
            this.toDispose.dispose();
        });
        this.registerDebugContributions(options.configuration.type, this.connection);

        if (parentSession) {
            parentSession.childSessions.set(id, this);
            this.toDispose.push(Disposable.create(() => {
                this.parentSession?.childSessions?.delete(id);
            }));
        }
        if (testRun) {
            try {
                const run = TestServices.withTestRun(testService, testRun.controllerId, testRun.runId);
                run.onDidChangeProperty(evt => {
                    if (evt.isRunning === false) {
                        sessionManager.terminateSession(this);
                    }
                });
            } catch (err) {
                console.error(err);
            }
        }

        this.connection.onDidClose(() => this.toDispose.dispose());
        this.toDispose.pushAll([
            this.onDidChangeEmitter,
            this.onDidChangeBreakpointsEmitter,
            Disposable.create(() => {
                this.clearBreakpoints();
                this.doUpdateThreads([]);
            }),
            this.connection,
            this.connection.on('initialized', () => this.configure()),
            this.connection.on('breakpoint', ({ body }) => this.updateBreakpoint(body)),
            this.connection.on('continued', e => this.handleContinued(e)),
            this.connection.on('stopped', e => this.handleStopped(e)),
            this.connection.on('thread', e => this.handleThread(e)),
            this.connection.on('capabilities', event => this.updateCapabilities(event.body.capabilities)),
            this.breakpoints.onDidChangeMarkers(uri => this.updateBreakpoints({ uri, sourceModified: true }))
        ]);
    }

    get onDispose(): Event<void> {
        return this.toDispose.onDispose;
    }

    get configuration(): DebugConfiguration {
        return this.options.configuration;
    }

    protected _capabilities: DebugProtocol.Capabilities = {};
    get capabilities(): DebugProtocol.Capabilities {
        return this._capabilities;
    }

    protected readonly sources = new Map<string, DebugSource>();
    getSource(raw: DebugProtocol.Source): DebugSource {
        const uri = DebugSource.toUri(raw).toString();
        const source = this.sources.get(uri) || new DebugSource(this, this.editorManager, this.labelProvider);
        source.update({ raw });
        this.sources.set(uri, source);
        return source;
    }

    getSourceForUri(uri: URI): DebugSource | undefined {
        return this.sources.get(uri.toString());
    }

    async toSource(uri: URI): Promise<DebugSource> {
        const source = this.getSourceForUri(uri);
        if (source) {
            return source;
        }

        return this.getSource(await this.toDebugSource(uri));
    }

    async toDebugSource(uri: URI): Promise<DebugProtocol.Source> {
        if (uri.scheme === DebugSource.SCHEME) {
            return {
                name: uri.path.toString(),
                sourceReference: Number(uri.query)
            };
        }
        const name = uri.displayName;
        let path;
        const underlying = await this.fileService.toUnderlyingResource(uri);
        if (underlying.scheme === 'file') {
            path = await this.fileService.fsPath(underlying);
        } else {
            path = uri.toString();
        }
        return { name, path };
    }

    protected _threads = new Map<number, DebugThread>();
    get threads(): IterableIterator<DebugThread> {
        return this._threads.values();
    }

    get threadCount(): number {
        return this._threads.size;
    }

    *getThreads(filter: (thread: DebugThread) => boolean): IterableIterator<DebugThread> {
        for (const thread of this.threads) {
            if (filter(thread)) {
                yield thread;
            }
        }
    }

    get runningThreads(): IterableIterator<DebugThread> {
        return this.getThreads(thread => !thread.stopped);
    }

    get stoppedThreads(): IterableIterator<DebugThread> {
        return this.getThreads(thread => thread.stopped);
    }

    async pauseAll(): Promise<void> {
        const promises: Promise<void>[] = [];
        for (const thread of this.runningThreads) {
            promises.push((async () => {
                try {
                    await thread.pause();
                } catch (e) {
                    console.error('pauseAll failed:', e);
                }
            })());
        }
        await Promise.all(promises);
    }

    async continueAll(): Promise<void> {
        const promises: Promise<void>[] = [];
        for (const thread of this.stoppedThreads) {
            promises.push((async () => {
                try {
                    await thread.continue();
                } catch (e) {
                    console.error('continueAll failed:', e);
                }
            })());
        }
        await Promise.all(promises);
    }

    get currentFrame(): DebugStackFrame | undefined {
        return this.currentThread && this.currentThread.currentFrame;
    }

    protected _currentThread: DebugThread | undefined;
    protected readonly toDisposeOnCurrentThread = new DisposableCollection();
    get currentThread(): DebugThread | undefined {
        return this._currentThread;
    }
    set currentThread(thread: DebugThread | undefined) {
        if (this._currentThread?.id === thread?.id) {
            return;
        }
        this.toDisposeOnCurrentThread.dispose();
        this._currentThread = thread;
        this.onDidFocusThreadEmitter.fire(thread);
        this.fireDidChange();
        if (thread) {
            this.toDisposeOnCurrentThread.push(thread.onDidChanged(() => this.fireDidChange()));
            this.toDisposeOnCurrentThread.push(thread.onDidFocusStackFrame(frame => this.onDidFocusStackFrameEmitter.fire(frame)));

            // If this thread is missing stack frame information, then load that.
            this.updateFrames();
        }
    }

    get state(): DebugState {
        if (this.connection.disposed) {
            return DebugState.Inactive;
        }
        if (!this.initialized) {
            return DebugState.Initializing;
        }
        const thread = this.currentThread;
        if (thread) {
            return thread.stopped ? DebugState.Stopped : DebugState.Running;
        }
        return !!this.stoppedThreads.next().value ? DebugState.Stopped : DebugState.Running;
    }

    async getScopes(): Promise<DebugScope[]> {
        const { currentFrame } = this;
        return currentFrame ? currentFrame.getScopes() : [];
    }

    showMessage(messageType: MessageType, message: string): void {
        this.messages.showMessage({
            type: messageType,
            text: message,
            options: {
                timeout: 10000
            }
        });
    }

    async start(): Promise<void> {
        await this.initialize();
        await this.launchOrAttach();
    }

    protected async initialize(): Promise<void> {
        try {
            const response = await this.connection.sendRequest('initialize', {
                clientID: 'Theia',
                clientName: nls.localize('theia/debug/TheiaIDE', 'Theia IDE'),
                adapterID: this.configuration.type,
                locale: 'en-US',
                linesStartAt1: true,
                columnsStartAt1: true,
                pathFormat: 'path',
                supportsVariableType: false,
                supportsVariablePaging: false,
                supportsRunInTerminalRequest: true
            });
            this.updateCapabilities(response?.body || {});
            this.didReceiveCapabilities.resolve();
        } catch (err) {
            this.didReceiveCapabilities.reject(err);
            throw err;
        }
    }

    protected async launchOrAttach(): Promise<void> {
        try {
            await this.sendRequest((this.configuration.request as keyof DebugRequestTypes), this.configuration);
        } catch (reason) {
            this.showMessage(MessageType.Error, reason.message || nls.localize('theia/debug/debugSessionInitializationFailed',
                'Debug session initialization failed. See console for details.'));
            throw reason;
        }
    }

    /**
     * The `send('initialize')` request could resolve later than `on('initialized')` emits the event.
     * Hence, the `configure` would use the empty object `capabilities`.
     * Using the empty `capabilities` could result in missing exception breakpoint filters, as
     * always `capabilities.exceptionBreakpointFilters` is falsy. This deferred promise works
     * around this timing issue. https://github.com/eclipse-theia/theia/issues/11886
     */
    protected didReceiveCapabilities = new Deferred<void>();
    protected initialized = false;
    protected async configure(): Promise<void> {
        await this.didReceiveCapabilities.promise;
        if (this.capabilities.exceptionBreakpointFilters) {
            const exceptionBreakpoints = [];
            for (const filter of this.capabilities.exceptionBreakpointFilters) {
                const origin = this.breakpoints.getExceptionBreakpoint(filter.filter);
                exceptionBreakpoints.push(ExceptionBreakpoint.create(filter, origin));
            }
            this.breakpoints.setExceptionBreakpoints(exceptionBreakpoints);
        }
        // mark as initialized, so updated breakpoints are shown in editor
        this.initialized = true;
        await this.updateBreakpoints({ sourceModified: false });
        if (this.capabilities.supportsConfigurationDoneRequest) {
            await this.sendRequest('configurationDone', {});
        }
        await this.updateThreads(undefined);
    }

    canTerminate(): boolean {
        return !!this.capabilities.supportsTerminateRequest;
    }

    canRestart(): boolean {
        return !!this.capabilities.supportsRestartRequest;
    }

    async restart(): Promise<void> {
        if (this.canRestart()) {
            await this.sendRequest('restart', {});
        }
    }

    async stop(isRestart: boolean, callback: () => void): Promise<void> {
        if (!this.isStopping) {
            this.isStopping = true;
            if (this.canTerminate()) {
                const terminated = this.waitFor('terminated', this.stopTimeout);
                try {
                    await this.connection.sendRequest('terminate', { restart: isRestart }, this.stopTimeout);
                    await terminated;
                } catch (e) {
                    this.handleTerminateError(e);
                }
            } else {
                const terminateDebuggee = this.initialized && this.capabilities.supportTerminateDebuggee;
                try {
                    await this.sendRequest('disconnect', { restart: isRestart, terminateDebuggee }, this.stopTimeout);
                } catch (e) {
                    this.handleDisconnectError(e);
                }
            }
            callback();
        }
    }

    /**
     * Invoked when sending the `terminate` request to the debugger is rejected or timed out.
     */
    protected handleTerminateError(err: unknown): void {
        console.error('Did not receive terminated event in time', err);
    }

    /**
     * Invoked when sending the `disconnect` request to the debugger is rejected or timed out.
     */
    protected handleDisconnectError(err: unknown): void {
        console.error('Error on disconnect', err);
    }

    async disconnect(isRestart: boolean, callback: () => void): Promise<void> {
        if (!this.isStopping) {
            this.isStopping = true;
            await this.sendRequest('disconnect', { restart: isRestart });
            callback();
        }
    }

    async completions(text: string, column: number, line: number): Promise<DebugProtocol.CompletionItem[]> {
        const frameId = this.currentFrame && this.currentFrame.raw.id;
        const response = await this.sendRequest('completions', { frameId, text, column, line });
        return response.body.targets;
    }

    async evaluate(expression: string, context?: string): Promise<DebugProtocol.EvaluateResponse['body']> {
        const frameId = this.currentFrame && this.currentFrame.raw.id;
        const response = await this.sendRequest('evaluate', { expression, frameId, context });
        return response.body;
    }

    sendRequest<K extends keyof DebugRequestTypes>(command: K, args: DebugRequestTypes[K][0], timeout?: number): Promise<DebugRequestTypes[K][1]> {
        return this.connection.sendRequest(command, args, timeout);
    }

    sendCustomRequest<T extends DebugProtocol.Response>(command: string, args?: any): Promise<T> {
        return this.connection.sendCustomRequest(command, args);
    }

    on<K extends keyof DebugEventTypes>(kind: K, listener: (e: DebugEventTypes[K]) => any): Disposable {
        return this.connection.on(kind, listener);
    }

    waitFor<K extends keyof DebugEventTypes>(kind: K, ms: number): Promise<void> {
        return waitForEvent(this.connection.onEvent(kind), ms).then();
    }

    get onDidCustomEvent(): Event<DebugProtocol.Event> {
        return this.connection.onDidCustomEvent;
    }

    protected async runInTerminal({ arguments: { title, cwd, args, env } }: DebugProtocol.RunInTerminalRequest): Promise<DebugProtocol.RunInTerminalResponse['body']> {
        const terminal = await this.doCreateTerminal({ title, cwd, env, useServerTitle: false });
        const { processId } = terminal;
        await terminal.executeCommand({ cwd, args, env });
        return { processId: await processId };
    }

    protected async doCreateTerminal(options: TerminalWidgetOptions): Promise<TerminalWidget> {
        let terminal = undefined;
        for (const t of this.terminalServer.all) {
            if ((t.title.label === options.title || t.title.caption === options.title) && (await t.hasChildProcesses()) === false) {
                terminal = t;
                break;
            }
        }

        if (!terminal) {
            terminal = await this.terminalServer.newTerminal(options);
            await terminal.start();
        }
        this.terminalServer.open(terminal);
        return terminal;
    }

    protected clearThreads(): void {
        for (const thread of this.threads) {
            thread.clear();
        }
        this.updateCurrentThread();
    }

    protected clearThread(threadId: number): void {
        const thread = this._threads.get(threadId);
        if (thread) {
            thread.clear();
        }
        this.updateCurrentThread();
    }

    protected readonly scheduleUpdateThreads = debounce(() => this.updateThreads(undefined), 100);
    protected pendingThreads = Promise.resolve();

    updateThreads(stoppedDetails: StoppedDetails | undefined): Promise<void> {
        return this.pendingThreads = this.pendingThreads.then(async () => {
            try {
                const response = await this.sendRequest('threads', {});
                // java debugger returns an empty body sometimes
                const threads = response && response.body && response.body.threads || [];
                this.doUpdateThreads(threads, stoppedDetails);
            } catch (e) {
                console.error('updateThreads failed:', e);
            }
        });
    }

    protected doUpdateThreads(threads: DebugProtocol.Thread[], stoppedDetails?: StoppedDetails): void {
        const existing = this._threads;
        this._threads = new Map();
        for (const raw of threads) {
            const id = raw.id;
            const thread = existing.get(id) || new DebugThread(this);
            this._threads.set(id, thread);
            const data: Partial<Mutable<DebugThreadData>> = { raw };
            if (stoppedDetails) {
                if (stoppedDetails.threadId === id) {
                    data.stoppedDetails = stoppedDetails;
                } else if (stoppedDetails.allThreadsStopped) {
                    data.stoppedDetails = {
                        // When a debug adapter notifies us that all threads are stopped,
                        // we do not know why the others are stopped, so we should default
                        // to something generic.
                        reason: '',
                    };
                }
            }
            thread.update(data);
        }
        this.updateCurrentThread(stoppedDetails);
    }

    protected updateCurrentThread(stoppedDetails?: StoppedDetails): void {
        const { currentThread } = this;
        let threadId = currentThread && currentThread.raw.id;
        if (stoppedDetails && !stoppedDetails.preserveFocusHint && !!stoppedDetails.threadId) {
            threadId = stoppedDetails.threadId;
        }
        this.currentThread = typeof threadId === 'number' && this._threads.get(threadId)
            || this._threads.values().next().value;
    }

    protected async updateFrames(): Promise<void> {
        const thread = this._currentThread;
        if (!thread || thread.pendingFrameCount || thread.frameCount) {
            return;
        }
        if (this.capabilities.supportsDelayedStackTraceLoading) {
            await thread.fetchFrames(1);
            await thread.fetchFrames(19);
        } else {
            await thread.fetchFrames();
        }
    }

    protected updateCapabilities(capabilities: DebugProtocol.Capabilities): void {
        Object.assign(this._capabilities, capabilities);
        this.deferredOnDidConfigureCapabilities.resolve();
    }

    protected readonly _breakpoints = new Map<string, DebugBreakpoint[]>();
    get breakpointUris(): IterableIterator<string> {
        return this._breakpoints.keys();
    }

    getSourceBreakpoints(uri?: URI): DebugSourceBreakpoint[] {
        const breakpoints = [];
        for (const breakpoint of this.getBreakpoints(uri)) {
            if (breakpoint instanceof DebugSourceBreakpoint) {
                breakpoints.push(breakpoint);
            }
        }
        return breakpoints;
    }

    getFunctionBreakpoints(): DebugFunctionBreakpoint[] {
        return this.getBreakpoints(BreakpointManager.FUNCTION_URI).filter((breakpoint): breakpoint is DebugFunctionBreakpoint => breakpoint instanceof DebugFunctionBreakpoint);
    }

    getInstructionBreakpoints(): DebugInstructionBreakpoint[] {
        if (this.capabilities.supportsInstructionBreakpoints) {
            return this.getBreakpoints(BreakpointManager.INSTRUCTION_URI)
                .filter((breakpoint): breakpoint is DebugInstructionBreakpoint => breakpoint instanceof DebugInstructionBreakpoint);
        }
        return this.breakpoints.getInstructionBreakpoints().map(origin => new DebugInstructionBreakpoint(origin, this.asDebugBreakpointOptions()));
    }

    getBreakpoints(uri?: URI): DebugBreakpoint[] {
        if (uri) {
            return this._breakpoints.get(uri.toString()) || [];
        }
        const result = [];
        for (const breakpoints of this._breakpoints.values()) {
            result.push(...breakpoints);
        }
        return result;
    }

    getBreakpoint(id: string): DebugBreakpoint | undefined {
        for (const breakpoints of this._breakpoints.values()) {
            const breakpoint = breakpoints.find(b => b.id === id);
            if (breakpoint) {
                return breakpoint;
            }

        }
        return undefined;
    }

    protected clearBreakpoints(): void {
        const uris = [...this._breakpoints.keys()];
        this._breakpoints.clear();
        for (const uri of uris) {
            this.fireDidChangeBreakpoints(new URI(uri));
        }
    }

    protected updatingBreakpoints = false;

    protected updateBreakpoint(body: DebugProtocol.BreakpointEvent['body']): void {
        this.updatingBreakpoints = true;
        try {
            const raw = body.breakpoint;
            if (body.reason === 'new') {
                if (raw.source && typeof raw.line === 'number') {
                    const uri = DebugSource.toUri(raw.source);
                    const origin = SourceBreakpoint.create(uri, { line: raw.line, column: raw.column });
                    if (this.breakpoints.addBreakpoint(origin)) {
                        const breakpoints = this.getSourceBreakpoints(uri);
                        const breakpoint = new DebugSourceBreakpoint(origin, this.asDebugBreakpointOptions());
                        breakpoint.update({ raw });
                        breakpoints.push(breakpoint);
                        this.setSourceBreakpoints(uri, breakpoints);
                    }
                }
            }
            if (body.reason === 'removed' && typeof raw.id === 'number') {
                const toRemove = this.findBreakpoint(b => b.idFromAdapter === raw.id);
                if (toRemove) {
                    toRemove.remove();
                    const breakpoints = this.getBreakpoints(toRemove.uri);
                    const index = breakpoints.indexOf(toRemove);
                    if (index !== -1) {
                        breakpoints.splice(index, 1);
                        this.setBreakpoints(toRemove.uri, breakpoints);
                    }
                }
            }
            if (body.reason === 'changed' && typeof raw.id === 'number') {
                const toUpdate = this.findBreakpoint(b => b.idFromAdapter === raw.id);
                if (toUpdate) {
                    toUpdate.update({ raw });
                    if (toUpdate instanceof DebugSourceBreakpoint) {
                        const sourceBreakpoints = this.getSourceBreakpoints(toUpdate.uri);
                        // in order to dedup again if a debugger converted line breakpoint to inline breakpoint
                        // i.e. assigned a column to a line breakpoint
                        this.setSourceBreakpoints(toUpdate.uri, sourceBreakpoints);
                    } else {
                        this.fireDidChangeBreakpoints(toUpdate.uri);
                    }
                }
            }
        } finally {
            this.updatingBreakpoints = false;
        }
    }
    protected findBreakpoint(match: (breakpoint: DebugBreakpoint) => boolean): DebugBreakpoint | undefined {
        for (const [, breakpoints] of this._breakpoints) {
            for (const breakpoint of breakpoints) {
                if (match(breakpoint)) {
                    return breakpoint;
                }
            }
        }
        return undefined;
    }

    protected async updateBreakpoints(options: {
        uri?: URI,
        sourceModified: boolean
    }): Promise<void> {
        if (this.updatingBreakpoints) {
            return;
        }
        const { uri, sourceModified } = options;
        await this.deferredOnDidConfigureCapabilities.promise;
        for (const affectedUri of this.getAffectedUris(uri)) {
            if (affectedUri.toString() === BreakpointManager.EXCEPTION_URI.toString()) {
                await this.sendExceptionBreakpoints();
            } else if (affectedUri.toString() === BreakpointManager.FUNCTION_URI.toString()) {
                await this.sendFunctionBreakpoints(affectedUri);
            } else if (affectedUri.toString() === BreakpointManager.INSTRUCTION_URI.toString()) {
                await this.sendInstructionBreakpoints();
            } else {
                await this.sendSourceBreakpoints(affectedUri, sourceModified);
            }
        }
    }

    protected async sendExceptionBreakpoints(): Promise<void> {
        const filters: string[] = [];
        const filterOptions: DebugProtocol.ExceptionFilterOptions[] | undefined = this.capabilities.supportsExceptionFilterOptions ? [] : undefined;
        for (const breakpoint of this.breakpoints.getExceptionBreakpoints()) {
            if (breakpoint.enabled) {
                if (filterOptions) {
                    filterOptions.push({
                        filterId: breakpoint.raw.filter,
                        condition: breakpoint.condition
                    });
                } else {
                    filters.push(breakpoint.raw.filter);
                }
            }
        }
        await this.sendRequest('setExceptionBreakpoints', { filters, filterOptions });
    }

    protected async sendFunctionBreakpoints(affectedUri: URI): Promise<void> {
        const all = this.breakpoints.getFunctionBreakpoints().map(origin =>
            new DebugFunctionBreakpoint(origin, this.asDebugBreakpointOptions())
        );
        const enabled = all.filter(b => b.enabled);
        if (this.capabilities.supportsFunctionBreakpoints) {
            try {
                const response = await this.sendRequest('setFunctionBreakpoints', {
                    breakpoints: enabled.map(b => b.origin.raw)
                });
                // Apparently, `body` and `breakpoints` can be missing.
                // https://github.com/eclipse-theia/theia/issues/11885
                // https://github.com/microsoft/vscode/blob/80004351ccf0884b58359f7c8c801c91bb827d83/src/vs/workbench/contrib/debug/browser/debugSession.ts#L448-L449
                if (response && response.body) {
                    response.body.breakpoints.forEach((raw, index) => {
                        // node debug adapter returns more breakpoints sometimes
                        if (enabled[index]) {
                            enabled[index].update({ raw });
                        }
                    });
                }
            } catch (error) {
                // could be error or promise rejection of DebugProtocol.SetFunctionBreakpoints
                if (error instanceof Error) {
                    console.error(`Error setting breakpoints: ${error.message}`);
                } else {
                    // handle adapters that send failed DebugProtocol.SetFunctionBreakpoints for invalid breakpoints
                    const genericMessage: string = 'Function breakpoint not valid for current debug session';
                    const message: string = error.message ? `${error.message}` : genericMessage;
                    console.warn(`Could not handle function breakpoints: ${message}, disabling...`);
                    enabled.forEach(b => b.update({
                        raw: {
                            verified: false,
                            message
                        }
                    }));
                }
            }
        }
        this.setBreakpoints(affectedUri, all);
    }

    protected async sendSourceBreakpoints(affectedUri: URI, sourceModified?: boolean): Promise<void> {
        const source = await this.toSource(affectedUri);
        const all = this.breakpoints.findMarkers({ uri: affectedUri }).map(({ data }) =>
            new DebugSourceBreakpoint(data, this.asDebugBreakpointOptions())
        );
        const enabled = all.filter(b => b.enabled);
        try {
            const breakpoints = enabled.map(({ origin }) => origin.raw);
            const response = await this.sendRequest('setBreakpoints', {
                source: source.raw,
                sourceModified,
                breakpoints,
                lines: breakpoints.map(({ line }) => line)
            });
            response.body.breakpoints.forEach((raw, index) => {
                // node debug adapter returns more breakpoints sometimes
                if (enabled[index]) {
                    enabled[index].update({ raw });
                }
            });
        } catch (error) {
            // could be error or promise rejection of DebugProtocol.SetBreakpointsResponse
            if (error instanceof Error) {
                console.error(`Error setting breakpoints: ${error.message}`);
            } else {
                // handle adapters that send failed DebugProtocol.SetBreakpointsResponse for invalid breakpoints
                const genericMessage: string = 'Breakpoint not valid for current debug session';
                const message: string = error.message ? `${error.message}` : genericMessage;
                console.warn(`Could not handle breakpoints for ${affectedUri}: ${message}, disabling...`);
                enabled.forEach(b => b.update({
                    raw: {
                        verified: false,
                        message
                    }
                }));
            }
        }
        this.setSourceBreakpoints(affectedUri, all);
    }

    protected async sendInstructionBreakpoints(): Promise<void> {
        if (!this.capabilities.supportsInstructionBreakpoints) {
            return;
        }
        const all = this.breakpoints.getInstructionBreakpoints().map(breakpoint => new DebugInstructionBreakpoint(breakpoint, this.asDebugBreakpointOptions()));
        const enabled = all.filter(breakpoint => breakpoint.enabled);
        try {
            const response = await this.sendRequest('setInstructionBreakpoints', {
                breakpoints: enabled.map(renderable => renderable.origin),
            });
            response.body.breakpoints.forEach((raw, index) => enabled[index]?.update({ raw }));
        } catch {
            enabled.forEach(breakpoint => breakpoint.update({ raw: { verified: false } }));
        }
        this.setBreakpoints(BreakpointManager.INSTRUCTION_URI, all);
    }

    protected setBreakpoints(uri: URI, breakpoints: DebugBreakpoint[]): void {
        this._breakpoints.set(uri.toString(), breakpoints);
        this.fireDidChangeBreakpoints(uri);
    }

    protected setSourceBreakpoints(uri: URI, breakpoints: DebugSourceBreakpoint[]): void {
        const distinct = this.dedupSourceBreakpoints(breakpoints);
        this.setBreakpoints(uri, distinct);
    }

    protected dedupSourceBreakpoints(all: DebugSourceBreakpoint[]): DebugSourceBreakpoint[] {
        const positions = new Map<string, DebugSourceBreakpoint>();
        for (const breakpoint of all) {
            let primary = positions.get(breakpoint.renderPosition()) || breakpoint;
            if (primary !== breakpoint) {
                let secondary = breakpoint;
                if (secondary.raw && secondary.raw.line === secondary.origin.raw.line && secondary.raw.column === secondary.origin.raw.column) {
                    [primary, secondary] = [breakpoint, primary];
                }
                primary.origins.push(...secondary.origins);
            }
            positions.set(primary.renderPosition(), primary);
        }
        return [...positions.values()];
    }

    protected *getAffectedUris(uri?: URI): IterableIterator<URI> {
        if (uri) {
            yield uri;
        } else {
            for (const uriString of this.breakpoints.getUris()) {
                yield new URI(uriString);
            }
            yield BreakpointManager.FUNCTION_URI;
            yield BreakpointManager.EXCEPTION_URI;
        }
    }

    protected asDebugBreakpointOptions(): DebugBreakpointOptions {
        const { labelProvider, breakpoints, editorManager } = this;
        return { labelProvider, breakpoints, editorManager, session: this };
    }

    get label(): string {
        const suffixes = [];
        if (InternalDebugSessionOptions.is(this.options) && this.options.id) {
            suffixes.push(String(this.options.id + 1));
        }
        if (this.workspaceService.isMultiRootWorkspaceOpened && this.options.workspaceFolderUri) {
            suffixes.push(this.labelProvider.getName(new URI(this.options.workspaceFolderUri)));
        }
        return suffixes.length === 0 ? this.configuration.name : this.configuration.name + ` (${suffixes.join(' - ')})`;
    }

    get visible(): boolean {
        return this.state > DebugState.Inactive;
    }

    render(): React.ReactNode {
        let label = '';
        const state = this.state === DebugState.Stopped ? nls.localizeByDefault('Paused') : nls.localizeByDefault('Running');
        const child = this.getSingleChildSession();
        if (child && child.configuration.compact) {
            // Inlines the name of the child debug session
            label = `: ${child.label}`;
        }
        return <div className='theia-debug-session' title='Session'>
            <span className='label'>{this.label + label}</span>
            <span className='status'>{state}</span>
        </div>;
    }

    *getElements(): IterableIterator<DebugThread | DebugSession> {
        const child = this.getSingleChildSession();
        if (child && child.configuration.compact) {
            // Inlines the elements of the child debug session
            return yield* child.getElements();
        }
        yield* this.threads;
        yield* this.childSessions.values();
    }

    protected getSingleChildSession(): DebugSession | undefined {
        if (this._threads.size === 0 && this.childSessions.size === 1) {
            const child = this.childSessions.values().next().value as DebugSession;
            return child;
        }
        return undefined;
    }

    protected async handleContinued({ body: { allThreadsContinued, threadId } }: DebugProtocol.ContinuedEvent): Promise<void> {
        if (allThreadsContinued !== false) {
            this.clearThreads();
        } else {
            this.clearThread(threadId);
        }
    };

    protected async handleStopped({ body }: DebugProtocol.StoppedEvent): Promise<void> {
        // Update thread list
        await this.updateThreads(body);

        // Update current thread's frames immediately
        await this.updateFrames();
    };

    protected async handleThread({ body: { reason, threadId } }: DebugProtocol.ThreadEvent): Promise<void> {
        if (reason === 'started') {
            this.scheduleUpdateThreads();
        } else if (reason === 'exited') {
            this._threads.delete(threadId);
            this.updateCurrentThread();
        }
    };

    protected registerDebugContributions(configType: string, connection: DebugSessionConnection): void {
        for (const contrib of this.debugContributionProvider.getContributions()) {
            contrib.register(configType, connection);
        }
    };

    /**
     * Returns the top-most parent session that is responsible for the console. If this session uses a {@link DebugConsoleMode.Separate separate console}
     * or does not have any parent session, undefined is returned.
     */
    public findConsoleParent(): DebugSession | undefined {
        if (this.configuration.consoleMode !== DebugConsoleMode.MergeWithParent) {
            return undefined;
        }
        let debugSession: DebugSession | undefined = this;
        do {
            debugSession = debugSession.parentSession;
        } while (debugSession?.parentSession && debugSession.configuration.consoleMode === DebugConsoleMode.MergeWithParent);
        return debugSession;
    }
}
