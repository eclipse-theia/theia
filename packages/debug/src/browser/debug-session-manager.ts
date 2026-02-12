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

import { CommandService, DisposableCollection, Emitter, Event, MessageService, nls, ProgressService, WaitUntilEvent } from '@theia/core';
import { LabelProvider, ApplicationShell, ConfirmDialog } from '@theia/core/lib/browser';
import { ContextKey, ContextKeyService } from '@theia/core/lib/browser/context-key-service';
import URI from '@theia/core/lib/common/uri';
import { EditorManager } from '@theia/editor/lib/browser';
import { QuickOpenTask } from '@theia/task/lib/browser/quick-open-task';
import { TaskService, TaskEndedInfo, TaskEndedTypes } from '@theia/task/lib/browser/task-service';
import { VariableResolverService } from '@theia/variable-resolver/lib/browser';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { DebugConfiguration } from '../common/debug-common';
import { DebugError, DebugService } from '../common/debug-service';
import { BreakpointManager } from './breakpoint/breakpoint-manager';
import { DebugConfigurationManager } from './debug-configuration-manager';
import { DebugSession, DebugState, debugStateContextValue } from './debug-session';
import { DebugSessionContributionRegistry, DebugSessionFactory } from './debug-session-contribution';
import { DebugCompoundRoot, DebugCompoundSessionOptions, DebugConfigurationSessionOptions, DebugSessionOptions, InternalDebugSessionOptions } from './debug-session-options';
import { DebugStackFrame } from './model/debug-stack-frame';
import { DebugThread } from './model/debug-thread';
import { TaskIdentifier } from '@theia/task/lib/common';
import { DebugSourceBreakpoint } from './model/debug-source-breakpoint';
import { DebugFunctionBreakpoint } from './model/debug-function-breakpoint';
import * as monaco from '@theia/monaco-editor-core';
import { DebugInstructionBreakpoint } from './model/debug-instruction-breakpoint';
import { DebugSessionConfigurationLabelProvider } from './debug-session-configuration-label-provider';
import { DebugDataBreakpoint } from './model/debug-data-breakpoint';
import { DebugVariable } from './console/debug-console-items';

export interface WillStartDebugSession extends WaitUntilEvent {
}

export interface WillResolveDebugConfiguration extends WaitUntilEvent {
    debugType: string
}

export interface DidChangeActiveDebugSession {
    previous: DebugSession | undefined
    current: DebugSession | undefined
}

export interface DidChangeBreakpointsEvent {
    session?: DebugSession
    uri: URI
}

export interface DidResolveLazyVariableEvent {
    readonly session: DebugSession
    readonly variable: DebugVariable
}

export interface DebugSessionCustomEvent {
    readonly body?: any // eslint-disable-line @typescript-eslint/no-explicit-any
    readonly event: string
    readonly session: DebugSession
}

@injectable()
export class DebugSessionManager {
    protected readonly _sessions = new Map<string, DebugSession>();

    protected readonly onWillStartDebugSessionEmitter = new Emitter<WillStartDebugSession>();
    readonly onWillStartDebugSession: Event<WillStartDebugSession> = this.onWillStartDebugSessionEmitter.event;

    protected readonly onWillResolveDebugConfigurationEmitter = new Emitter<WillResolveDebugConfiguration>();
    readonly onWillResolveDebugConfiguration: Event<WillResolveDebugConfiguration> = this.onWillResolveDebugConfigurationEmitter.event;

    protected readonly onDidCreateDebugSessionEmitter = new Emitter<DebugSession>();
    readonly onDidCreateDebugSession: Event<DebugSession> = this.onDidCreateDebugSessionEmitter.event;

    protected readonly onDidStartDebugSessionEmitter = new Emitter<DebugSession>();
    readonly onDidStartDebugSession: Event<DebugSession> = this.onDidStartDebugSessionEmitter.event;

    protected readonly onDidStopDebugSessionEmitter = new Emitter<DebugSession>();
    readonly onDidStopDebugSession: Event<DebugSession> = this.onDidStopDebugSessionEmitter.event;

    protected readonly onDidChangeActiveDebugSessionEmitter = new Emitter<DidChangeActiveDebugSession>();
    readonly onDidChangeActiveDebugSession: Event<DidChangeActiveDebugSession> = this.onDidChangeActiveDebugSessionEmitter.event;

    protected readonly onDidDestroyDebugSessionEmitter = new Emitter<DebugSession>();
    readonly onDidDestroyDebugSession: Event<DebugSession> = this.onDidDestroyDebugSessionEmitter.event;

    protected readonly onDidReceiveDebugSessionCustomEventEmitter = new Emitter<DebugSessionCustomEvent>();
    readonly onDidReceiveDebugSessionCustomEvent: Event<DebugSessionCustomEvent> = this.onDidReceiveDebugSessionCustomEventEmitter.event;

    protected readonly onDidFocusStackFrameEmitter = new Emitter<DebugStackFrame | undefined>();
    readonly onDidFocusStackFrame = this.onDidFocusStackFrameEmitter.event;

    protected readonly onDidFocusThreadEmitter = new Emitter<DebugThread | undefined>();
    readonly onDidFocusThread = this.onDidFocusThreadEmitter.event;

    protected readonly onDidChangeBreakpointsEmitter = new Emitter<DidChangeBreakpointsEvent>();
    readonly onDidChangeBreakpoints = this.onDidChangeBreakpointsEmitter.event;
    protected fireDidChangeBreakpoints(event: DidChangeBreakpointsEvent): void {
        this.onDidChangeBreakpointsEmitter.fire(event);
    }

    protected readonly onDidChangeEmitter = new Emitter<DebugSession | undefined>();
    readonly onDidChange: Event<DebugSession | undefined> = this.onDidChangeEmitter.event;
    protected fireDidChange(current: DebugSession | undefined): void {
        this.debugTypeKey.set(current?.configuration.type);
        this.inDebugModeKey.set(this.inDebugMode);
        this.debugStateKey.set(debugStateContextValue(this.state));
        this.onDidChangeEmitter.fire(current);
    }

    protected readonly onDidResolveLazyVariableEmitter = new Emitter<DidResolveLazyVariableEvent>();
    readonly onDidResolveLazyVariable: Event<DidResolveLazyVariableEvent> = this.onDidResolveLazyVariableEmitter.event;

    @inject(DebugSessionFactory)
    protected readonly debugSessionFactory: DebugSessionFactory;

    @inject(DebugService)
    protected readonly debug: DebugService;

    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(CommandService)
    protected commandService: CommandService;

    @inject(BreakpointManager)
    protected readonly breakpoints: BreakpointManager;

    @inject(VariableResolverService)
    protected readonly variableResolver: VariableResolverService;

    @inject(DebugSessionContributionRegistry)
    protected readonly sessionContributionRegistry: DebugSessionContributionRegistry;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    @inject(ProgressService)
    protected readonly progressService: ProgressService;

    @inject(ContextKeyService)
    protected readonly contextKeyService: ContextKeyService;

    @inject(TaskService)
    protected readonly taskService: TaskService;

    @inject(DebugConfigurationManager)
    protected readonly debugConfigurationManager: DebugConfigurationManager;

    @inject(QuickOpenTask)
    protected readonly quickOpenTask: QuickOpenTask;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(DebugSessionConfigurationLabelProvider)
    protected readonly sessionConfigurationLabelProvider: DebugSessionConfigurationLabelProvider;

    protected debugTypeKey: ContextKey<string>;
    protected inDebugModeKey: ContextKey<boolean>;
    protected debugStateKey: ContextKey<string>;

    @postConstruct()
    protected init(): void {
        this.debugTypeKey = this.contextKeyService.createKey<string>('debugType', undefined);
        this.inDebugModeKey = this.contextKeyService.createKey<boolean>('inDebugMode', this.inDebugMode);
        this.debugStateKey = this.contextKeyService.createKey<string>('debugState', debugStateContextValue(this.state));
        this.breakpoints.onDidChangeMarkers(uri => this.fireDidChangeBreakpoints({ uri }));
        this.labelProvider.onDidChange(event => {
            for (const uriString of this.breakpoints.getUris()) {
                const uri = new URI(uriString);
                if (event.affects(uri)) {
                    this.fireDidChangeBreakpoints({ uri });
                }
            }
        });
    }

    get inDebugMode(): boolean {
        return this.state > DebugState.Inactive;
    }

    isCurrentEditorFrame(uri: URI | string | monaco.Uri): boolean {
        return this.currentFrame?.source?.uri.toString() === (uri instanceof URI ? uri : new URI(uri.toString())).toString();
    }

    protected async saveAll(): Promise<boolean> {
        if (!this.shell.canSaveAll()) {
            return true; // Nothing to save.
        }
        try {
            await this.shell.saveAll();
            return true;
        } catch (error) {
            console.error('saveAll failed:', error);
            return false;
        }
    }

    async start(options: DebugCompoundSessionOptions): Promise<boolean | undefined>;
    async start(options: DebugConfigurationSessionOptions): Promise<DebugSession | undefined>;
    async start(options: DebugSessionOptions): Promise<DebugSession | boolean | undefined>;
    async start(name: string): Promise<DebugSession | boolean | undefined>;
    async start(optionsOrName: DebugSessionOptions | string): Promise<DebugSession | boolean | undefined> {
        if (typeof optionsOrName === 'string') {
            const options = this.debugConfigurationManager.find(optionsOrName);
            return !!options && this.start(options);
        }
        return optionsOrName.configuration ? this.startConfiguration(optionsOrName) : this.startCompound(optionsOrName);
    }

    protected async startConfiguration(options: DebugConfigurationSessionOptions): Promise<DebugSession | undefined> {
        return this.progressService.withProgress(nls.localizeByDefault('Starting...'), 'debug', async () => {
            try {
                // If a parent session is available saving should be handled by the parent
                if (!options.configuration.parentSessionId && !options.configuration.suppressSaveBeforeStart && !await this.saveAll()) {
                    return undefined;
                }
                await this.fireWillStartDebugSession();
                const resolved = await this.resolveConfiguration(options);

                if (!resolved || !resolved.configuration) {
                    // As per vscode API: https://code.visualstudio.com/api/references/vscode-api#DebugConfigurationProvider
                    // "Returning the value 'undefined' prevents the debug session from starting.
                    // Returning the value 'null' prevents the debug session from starting and opens the
                    // underlying debug configuration instead."

                    // eslint-disable-next-line no-null/no-null
                    if (resolved === null) {
                        this.debugConfigurationManager.openConfiguration();
                    }
                    return undefined;
                }

                const sessionConfigurationLabel = this.sessionConfigurationLabelProvider.getLabel(resolved);
                if (options?.startedByUser
                    && options.configuration.suppressMultipleSessionWarning !== true
                    && this.sessions.some(s => this.sessionConfigurationLabelProvider.getLabel(s.options) === sessionConfigurationLabel)
                ) {
                    const yes = await new ConfirmDialog({
                        title: nls.localizeByDefault('Debug'),
                        msg: nls.localizeByDefault("'{0}' is already running. Do you want to start another instance?", sessionConfigurationLabel)
                    }).open();
                    if (!yes) {
                        return undefined;
                    }
                }

                // preLaunchTask isn't run in case of auto restart as well as postDebugTask
                if (!options.configuration.__restart) {
                    const taskRun = await this.runTask(options.workspaceFolderUri, resolved.configuration.preLaunchTask, true);
                    if (!taskRun) {
                        return undefined;
                    }
                }

                const sessionId = await this.debug.createDebugSession(resolved.configuration, options.workspaceFolderUri);
                return this.doStart(sessionId, resolved);
            } catch (e) {
                if (DebugError.NotFound.is(e)) {
                    this.messageService.error(nls.localize('theia/debug/debugSessionTypeNotSupported', 'The debug session type "{0}" is not supported.', e.data.type));
                    return undefined;
                }

                this.messageService.error(nls.localize('theia/debug/errorStartingDebugSession', 'There was an error starting the debug session, check the logs for more details.'));
                console.error('Error starting the debug session', e);
                throw e;
            }
        });
    }

    protected async startCompound(options: DebugCompoundSessionOptions): Promise<boolean | undefined> {
        let configurations: DebugConfigurationSessionOptions[] = [];
        const compoundRoot = options.compound.stopAll ? new DebugCompoundRoot() : undefined;
        try {
            configurations = this.getCompoundConfigurations(options, compoundRoot);
        } catch (error) {
            this.messageService.error(error.message);
            return;
        }

        if (options.compound.preLaunchTask) {
            const taskRun = await this.runTask(options.workspaceFolderUri, options.compound.preLaunchTask, true);
            if (!taskRun) {
                return undefined;
            }
        }

        // Compound launch is a success only if each configuration launched successfully
        const values = await Promise.all(configurations.map(async configuration => {
            const newSession = await this.startConfiguration(configuration);
            if (newSession) {
                compoundRoot?.onDidSessionStop(() => newSession.stop(false, () => this.debug.terminateDebugSession(newSession.id)));
            }
            return newSession;
        }));
        const result = values.every(success => !!success);
        return result;
    }

    protected getCompoundConfigurations(options: DebugCompoundSessionOptions, compoundRoot: DebugCompoundRoot | undefined): DebugConfigurationSessionOptions[] {
        const compound = options.compound;
        if (!compound.configurations) {
            throw new Error(nls.localizeByDefault('Compound must have "configurations" attribute set in order to start multiple configurations.'));
        }

        const configurations: DebugConfigurationSessionOptions[] = [];

        for (const configData of compound.configurations) {
            const name = typeof configData === 'string' ? configData : configData.name;
            if (name === compound.name) {
                throw new Error(nls.localize('theia/debug/compound-cycle', "Launch configuration '{0}' contains a cycle with itself", name));
            }

            const workspaceFolderUri = typeof configData === 'string' ? options.workspaceFolderUri : configData.folder;
            const matchingOptions = [...this.debugConfigurationManager.all]
                .filter(option => option.name === name && !!option.configuration && option.workspaceFolderUri === workspaceFolderUri);
            if (matchingOptions.length === 1) {
                const match = matchingOptions[0];
                if (DebugSessionOptions.isConfiguration(match)) {
                    configurations.push({ ...match, compoundRoot, configuration: { ...match.configuration, noDebug: options.noDebug } });
                } else {
                    throw new Error(nls.localizeByDefault("Could not find launch configuration '{0}' in the workspace.", name));
                }
            } else {
                throw new Error(matchingOptions.length === 0
                    ? workspaceFolderUri
                        ? nls.localizeByDefault("Can not find folder with name '{0}' for configuration '{1}' in compound '{2}'.", workspaceFolderUri, name, compound.name)
                        : nls.localizeByDefault("Could not find launch configuration '{0}' in the workspace.", name)
                    : nls.localizeByDefault("There are multiple launch configurations '{0}' in the workspace. Use folder name to qualify the configuration.", name));
            }
        }
        return configurations;
    }

    protected async fireWillStartDebugSession(): Promise<void> {
        await WaitUntilEvent.fire(this.onWillStartDebugSessionEmitter, {});
    }

    protected configurationIds = new Map<string, number>();
    protected async resolveConfiguration(
        options: Readonly<DebugConfigurationSessionOptions>
    ): Promise<InternalDebugSessionOptions | undefined | null> {
        if (InternalDebugSessionOptions.is(options)) {
            return options;
        }
        const { workspaceFolderUri } = options;
        let configuration = await this.resolveDebugConfiguration(options.configuration, workspaceFolderUri);

        if (configuration) {
            // Resolve command variables provided by the debugger
            const commandIdVariables = await this.debug.provideDebuggerVariables(configuration.type);
            configuration = await this.variableResolver.resolve(configuration, {
                context: options.workspaceFolderUri ? new URI(options.workspaceFolderUri) : undefined,
                configurationSection: 'launch',
                commandIdVariables,
                configuration
            });

            if (configuration) {
                configuration = await this.resolveDebugConfigurationWithSubstitutedVariables(
                    configuration,
                    workspaceFolderUri
                );
            }
        }

        if (!configuration) {
            return configuration;
        }

        const key = configuration.name + workspaceFolderUri;
        const id = this.configurationIds.has(key) ? this.configurationIds.get(key)! + 1 : 0;
        this.configurationIds.set(key, id);

        return {
            id,
            ...options,
            name: configuration.name,
            configuration
        };
    }

    protected async resolveDebugConfiguration(
        configuration: DebugConfiguration,
        workspaceFolderUri: string | undefined
    ): Promise<DebugConfiguration | undefined | null> {
        await this.fireWillResolveDebugConfiguration(configuration.type);
        return this.debug.resolveDebugConfiguration(configuration, workspaceFolderUri);
    }

    protected async fireWillResolveDebugConfiguration(debugType: string): Promise<void> {
        await WaitUntilEvent.fire(this.onWillResolveDebugConfigurationEmitter, { debugType });
    }

    protected async resolveDebugConfigurationWithSubstitutedVariables(
        configuration: DebugConfiguration,
        workspaceFolderUri: string | undefined
    ): Promise<DebugConfiguration | undefined | null> {
        return this.debug.resolveDebugConfigurationWithSubstitutedVariables(configuration, workspaceFolderUri);
    }

    protected async doStart(sessionId: string, options: DebugConfigurationSessionOptions): Promise<DebugSession> {
        const parentSession = options.configuration.parentSessionId ? this._sessions.get(options.configuration.parentSessionId) : undefined;
        const contrib = this.sessionContributionRegistry.get(options.configuration.type);
        const sessionFactory = contrib ? contrib.debugSessionFactory() : this.debugSessionFactory;
        const session = sessionFactory.get(this, sessionId, options, parentSession);
        this._sessions.set(sessionId, session);

        this.debugTypeKey.set(session.configuration.type);
        this.onDidCreateDebugSessionEmitter.fire(session);

        let state = DebugState.Inactive;
        session.onDidChange(() => {
            if (state !== session.state) {
                state = session.state;
                if (state === DebugState.Stopped) {
                    this.onDidStopDebugSessionEmitter.fire(session);
                    // Only switch to this session if a thread actually stopped (not just state change)
                    if (session.currentThread && session.currentThread.stopped) {
                        this.updateCurrentSession(session);
                    }
                }
            }
            // Always fire change event to update views (threads, variables, etc.)
            // The selection logic in widgets will handle not jumping to non-stopped threads
            this.fireDidChange(session);
        });
        session.onDidChangeBreakpoints(uri => this.fireDidChangeBreakpoints({ session, uri }));
        session.on('terminated', async event => {
            const restart = event.body && event.body.restart;
            if (restart) {
                // postDebugTask isn't run in case of auto restart as well as preLaunchTask
                this.doRestart(session, !!restart);
            } else {
                await session.disconnect(false, () => this.debug.terminateDebugSession(session.id));
                await this.runTask(session.options.workspaceFolderUri, session.configuration.postDebugTask);
            }
        });

        session.on('exited', async event => {
            await session.disconnect(false, () => this.debug.terminateDebugSession(session.id));
        });

        session.onDispose(() => this.cleanup(session));
        session.start().then(() => {
            this.onDidStartDebugSessionEmitter.fire(session);
            // Set as current session if no current session exists
            // This ensures the UI shows the running session and buttons are enabled
            if (!this.currentSession) {
                this.updateCurrentSession(session);
            }
        }).catch(e => {
            session.stop(false, () => {
                this.debug.terminateDebugSession(session.id);
            });
        });
        session.onDidCustomEvent(({ event, body }) =>
            this.onDidReceiveDebugSessionCustomEventEmitter.fire({ event, body, session })
        );
        return session;
    }

    protected cleanup(session: DebugSession): void {
        // Data breakpoints belonging to this session that can't persist and aren't verified by some other session should be removed.
        const currentDataBreakpoints = this.breakpoints.getDataBreakpoints();
        const toRemove = currentDataBreakpoints.filter(candidate => !candidate.info.canPersist && this.sessions.every(otherSession => otherSession !== session
            && otherSession.getDataBreakpoints().every(otherSessionBp => otherSessionBp.id !== candidate.id || !otherSessionBp.verified)))
            .map(bp => bp.id);
        const toRetain = this.breakpoints.getDataBreakpoints().filter(candidate => !toRemove.includes(candidate.id));
        if (currentDataBreakpoints.length !== toRetain.length) {
            this.breakpoints.setDataBreakpoints(toRetain);
        }
        if (this.remove(session.id)) {
            this.onDidDestroyDebugSessionEmitter.fire(session);
        }
    }

    protected async doRestart(session: DebugSession, isRestart: boolean): Promise<DebugSession | undefined> {
        if (session.canRestart()) {
            await session.restart();
            return session;
        }

        const { options, configuration } = session;
        session.stop(isRestart, () => this.debug.terminateDebugSession(session.id));
        configuration.__restart = isRestart;
        return this.start(options);
    }

    async terminateSession(session?: DebugSession): Promise<void> {
        if (!session) {
            this.updateCurrentSession(this._currentSession);
            session = this._currentSession;
        }
        if (session) {
            if (session.options.compoundRoot) {
                session.options.compoundRoot.stopSession();
            } else if (session.parentSession && session.configuration.lifecycleManagedByParent) {
                this.terminateSession(session.parentSession);
            } else {
                session.stop(false, () => this.debug.terminateDebugSession(session!.id));
            }
        }
    }

    async restartSession(session?: DebugSession): Promise<DebugSession | undefined> {
        if (!session) {
            this.updateCurrentSession(this._currentSession);
            session = this._currentSession;
        }

        if (session) {
            if (session.parentSession && session.configuration.lifecycleManagedByParent) {
                return this.restartSession(session.parentSession);
            } else {
                return this.doRestart(session, true);
            }
        }
    }

    protected remove(sessionId: string): boolean {
        const existed = this._sessions.delete(sessionId);
        const { currentSession } = this;
        if (currentSession && currentSession.id === sessionId) {
            this.updateCurrentSession(undefined);
        }
        return existed;
    }

    getSession(sessionId: string): DebugSession | undefined {
        return this._sessions.get(sessionId);
    }

    get sessions(): DebugSession[] {
        return Array.from(this._sessions.values()).filter(session => session.state > DebugState.Inactive);
    }

    protected _currentSession: DebugSession | undefined;
    protected readonly disposeOnCurrentSessionChanged = new DisposableCollection();
    get currentSession(): DebugSession | undefined {
        return this._currentSession;
    }
    set currentSession(current: DebugSession | undefined) {
        if (this._currentSession === current) {
            return;
        }
        this.disposeOnCurrentSessionChanged.dispose();
        const previous = this.currentSession;
        this._currentSession = current;
        this.onDidChangeActiveDebugSessionEmitter.fire({ previous, current });
        if (current) {
            this.disposeOnCurrentSessionChanged.push(current.onDidChange(() => {
                if (this.currentFrame === this.topFrame) {
                    this.open('auto');
                }
                this.fireDidChange(current);
            }));
            this.disposeOnCurrentSessionChanged.push(current.onDidResolveLazyVariable(variable => this.onDidResolveLazyVariableEmitter.fire({ session: current, variable })));
            this.disposeOnCurrentSessionChanged.push(current.onDidFocusStackFrame(frame => this.onDidFocusStackFrameEmitter.fire(frame)));
            this.disposeOnCurrentSessionChanged.push(current.onDidFocusThread(thread => this.onDidFocusThreadEmitter.fire(thread)));
            const { currentThread } = current;
            this.onDidFocusThreadEmitter.fire(currentThread);
        }
        this.updateBreakpoints(previous, current);
        this.open();
        this.fireDidChange(current);
    }
    open(revealOption: 'auto' | 'center' = 'center'): void {
        const { currentFrame } = this;
        if (currentFrame && currentFrame.thread.stopped) {
            currentFrame.open({ revealOption });
        }
    }
    protected updateBreakpoints(previous: DebugSession | undefined, current: DebugSession | undefined): void {
        const affectedUri = new Set();
        for (const session of [previous, current]) {
            if (session) {
                for (const uriString of session.breakpointUris) {
                    if (!affectedUri.has(uriString)) {
                        affectedUri.add(uriString);
                        this.fireDidChangeBreakpoints({
                            session: current,
                            uri: new URI(uriString)
                        });
                    }
                }
            }
        }
    }
    protected updateCurrentSession(session: DebugSession | undefined): void {
        this.currentSession = session || this.sessions[0];
    }

    get currentThread(): DebugThread | undefined {
        const session = this.currentSession;
        return session && session.currentThread;
    }

    get state(): DebugState {
        const session = this.currentSession;
        return session ? session.state : DebugState.Inactive;
    }

    get currentFrame(): DebugStackFrame | undefined {
        const { currentThread } = this;
        return currentThread && currentThread.currentFrame;
    }
    get topFrame(): DebugStackFrame | undefined {
        const { currentThread } = this;
        return currentThread && currentThread.topFrame;
    }

    getFunctionBreakpoints(session?: DebugSession): DebugFunctionBreakpoint[] {
        if (session && session.state > DebugState.Initializing) {
            return session.getFunctionBreakpoints();
        }
        const { labelProvider, breakpoints, editorManager } = this;
        return this.breakpoints.getFunctionBreakpoints().map(origin => new DebugFunctionBreakpoint(origin, { labelProvider, breakpoints, editorManager }));
    }

    getInstructionBreakpoints(session?: DebugSession): DebugInstructionBreakpoint[] {
        if (session && session.state > DebugState.Initializing) {
            return session.getInstructionBreakpoints();
        }
        const { labelProvider, breakpoints, editorManager } = this;
        return this.breakpoints.getInstructionBreakpoints().map(origin => new DebugInstructionBreakpoint(origin, { labelProvider, breakpoints, editorManager }));
    }

    getDataBreakpoints(session = this.currentSession): DebugDataBreakpoint[] {
        if (session && session.state > DebugState.Initializing) {
            return session.getDataBreakpoints();
        }
        const { labelProvider, breakpoints, editorManager } = this;
        return this.breakpoints.getDataBreakpoints().map(origin => new DebugDataBreakpoint(origin, { labelProvider, breakpoints, editorManager }));
    }

    getBreakpoints(session?: DebugSession): DebugSourceBreakpoint[];
    getBreakpoints(uri: URI, session?: DebugSession): DebugSourceBreakpoint[];
    getBreakpoints(arg?: URI | DebugSession, arg2?: DebugSession): DebugSourceBreakpoint[] {
        const uri = arg instanceof URI ? arg : undefined;
        const session = arg instanceof DebugSession ? arg : arg2 instanceof DebugSession ? arg2 : undefined;
        if (session && session.state > DebugState.Initializing) {
            return session.getSourceBreakpoints(uri);
        }

        const activeSessions = this.sessions.filter(s => s.state > DebugState.Initializing);

        // Start with all breakpoints from markers (not installed = shows as filled circle)
        const { labelProvider, breakpoints, editorManager } = this;
        const breakpointMap = new Map<string, DebugSourceBreakpoint>();
        const markers = this.breakpoints.findMarkers({ uri });

        for (const { data } of markers) {
            const bp = new DebugSourceBreakpoint(data, { labelProvider, breakpoints, editorManager }, this.commandService);
            breakpointMap.set(bp.id, bp);
        }

        // Overlay with VERIFIED breakpoints from active sessions only
        // We only replace a marker-based breakpoint if the session has VERIFIED it
        // This ensures breakpoints show as filled (not installed) rather than hollow (installed but unverified)
        for (const activeSession of activeSessions) {
            const sessionBps = activeSession.getSourceBreakpoints(uri);

            for (const bp of sessionBps) {
                if (bp.verified) {
                    // Session has verified this breakpoint - use the session's version
                    breakpointMap.set(bp.id, bp);
                }
                // If not verified, keep the marker-based one (shows as not installed = filled circle)
            }
        }

        return Array.from(breakpointMap.values());
    }

    getLineBreakpoints(uri: URI, line: number): DebugSourceBreakpoint[] {
        const session = this.currentSession;
        if (session && session.state > DebugState.Initializing) {
            return session.getSourceBreakpoints(uri).filter(breakpoint => breakpoint.line === line);
        }
        const { labelProvider, breakpoints, editorManager } = this;
        return this.breakpoints.getLineBreakpoints(uri, line).map(origin =>
            new DebugSourceBreakpoint(origin, { labelProvider, breakpoints, editorManager }, this.commandService)
        );
    }

    getInlineBreakpoint(uri: URI, line: number, column: number): DebugSourceBreakpoint | undefined {
        const session = this.currentSession;
        if (session && session.state > DebugState.Initializing) {
            return session.getSourceBreakpoints(uri).filter(breakpoint => breakpoint.line === line && breakpoint.column === column)[0];
        }
        const origin = this.breakpoints.getInlineBreakpoint(uri, line, column);
        const { labelProvider, breakpoints, editorManager } = this;
        return origin && new DebugSourceBreakpoint(origin, { labelProvider, breakpoints, editorManager }, this.commandService);
    }

    /**
     * Runs the given tasks.
     * @param taskName the task name to run, see [TaskNameResolver](#TaskNameResolver)
     * @return true if it allowed to continue debugging otherwise it returns false
     */
    protected async runTask(workspaceFolderUri: string | undefined, taskName: string | TaskIdentifier | undefined, checkErrors?: boolean): Promise<boolean> {
        if (!taskName) {
            return true;
        }

        const taskInfo = await this.taskService.runWorkspaceTask(this.taskService.startUserAction(), workspaceFolderUri, taskName);
        if (!checkErrors) {
            return true;
        }

        const taskLabel = typeof taskName === 'string' ? taskName : JSON.stringify(taskName);
        if (!taskInfo) {
            return this.doPostTaskAction(nls.localize('theia/debug/couldNotRunTask', "Could not run the task '{0}'.", taskLabel));
        }

        const getExitCodePromise: Promise<TaskEndedInfo> = this.taskService.getExitCode(taskInfo.taskId).then(result =>
            ({ taskEndedType: TaskEndedTypes.TaskExited, value: result }));
        const isBackgroundTaskEndedPromise: Promise<TaskEndedInfo> = this.taskService.isBackgroundTaskEnded(taskInfo.taskId).then(result =>
            ({ taskEndedType: TaskEndedTypes.BackgroundTaskEnded, value: result }));

        // After start running the task, we wait for the task process to exit and if it is a background task, we also wait for a feedback
        // that a background task is active, as soon as one of the promises fulfills, we can continue and analyze the results.
        const taskEndedInfo: TaskEndedInfo = await Promise.race([getExitCodePromise, isBackgroundTaskEndedPromise]);

        if (taskEndedInfo.taskEndedType === TaskEndedTypes.BackgroundTaskEnded && taskEndedInfo.value) {
            return true;
        }
        if (taskEndedInfo.taskEndedType === TaskEndedTypes.TaskExited && taskEndedInfo.value === 0) {
            return true;
        } else if (taskEndedInfo.taskEndedType === TaskEndedTypes.TaskExited && taskEndedInfo.value !== undefined) {
            return this.doPostTaskAction(nls.localize('theia/debug/taskTerminatedWithExitCode', "Task '{0}' terminated with exit code {1}.", taskLabel, taskEndedInfo.value));
        } else {
            const signal = await this.taskService.getTerminateSignal(taskInfo.taskId);
            if (signal !== undefined) {
                return this.doPostTaskAction(nls.localize('theia/debug/taskTerminatedBySignal', "Task '{0}' terminated by signal {1}.", taskLabel, signal));
            } else {
                return this.doPostTaskAction(nls.localize('theia/debug/taskTerminatedForUnknownReason', "Task '{0}' terminated for unknown reason.", taskLabel));
            }
        }
    }

    protected async doPostTaskAction(errorMessage: string): Promise<boolean> {
        const actions = [
            nls.localizeByDefault('Open {0}', 'launch.json'),
            nls.localizeByDefault('Cancel'),
            nls.localizeByDefault('Configure Task'),
            nls.localizeByDefault('Debug Anyway')
        ];
        const result = await this.messageService.error(errorMessage, ...actions);
        switch (result) {
            case actions[0]: // open launch.json
                this.debugConfigurationManager.openConfiguration();
                return false;
            case actions[1]: // cancel
                return false;
            case actions[2]: // configure tasks
                this.quickOpenTask.configure();
                return false;
            default: // continue debugging
                return true;
        }
    }
}
