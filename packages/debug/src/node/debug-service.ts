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

import { injectable, inject, named } from "inversify";
import { ContributionProvider, ILogger } from '@theia/core';
import {
    DebugService,
    DebugConfigurationProviderRegistry,
    DebugConfigurationProvider,
    DebugSessionFactoryRegistry,
    DebugSessionFactory,
    DebugSession,
    DebugConfigurationContribution,
    DebugSessionFactoryContribution,
    DebugConfiguration,
    DebugAdapterExecutable
} from "../common/debug-model";
import { DebugAdapterSession } from './debug-adapter';
import { DebugProtocol } from 'vscode-debugprotocol';
import { UUID } from "@phosphor/coreutils";

/**
 * DebugConfigurationManager symbol for DI.
 */
export const DebugConfigurationManager = Symbol('DebugConfigurationManager');

/**
 * [Debug configuration](#DebugConfiguration) manager.
 */
export interface DebugConfigurationManager {
    /**
     * Finds and returns an array of registered debug types.
     * @returns An array of registered debug types
     */
    listDebugConfigurationProviders(): string[];

    /**
     * Provides initial debug configurations for the specific debug type.
     * @param debugType The registered debug type
     * @returns An array of [debug configurations](#DebugConfiguration)
     */
    provideDebugConfiguration(debugType: string): DebugConfiguration[];

    /**
     * Resolves debug configuration for the specific debug type.
     * @param debugType The registered debug type
     * @param config The debug configuration to resolve
     * @returns Resolved [debug configurations](#DebugConfiguration)
     */
    resolveDebugConfiguration(debugType: string, config: DebugConfiguration): DebugConfiguration | undefined;

    /**
     * Provide a [command line][#DebugAdapterExecutable] to launch debug adapter
     * @param debugType The registered debug type
     * @param config The debug configuration
     * @returns The command and arguments to launch a new debug adapter
     */
    provideDebugAdapterExecutable(debugType: string, config: DebugConfiguration): DebugAdapterExecutable | undefined;
}

/**
 * DebugConfigurationManager implementation.
 */
@injectable()
export class DebugConfigurationManagerImpl implements DebugConfigurationManager, DebugConfigurationProviderRegistry {
    protected readonly providers = new Map<string, DebugConfigurationProvider>();

    constructor(
        @inject(ContributionProvider) @named(DebugConfigurationContribution)
        protected readonly contributions: ContributionProvider<DebugConfigurationContribution>
    ) {
        for (const contrib of this.contributions.getContributions()) {
            contrib.registerDebugConfigurationProvider(this);
        }
    }

    registerDebugConfigurationProvider(debugType: string, provider: DebugConfigurationProvider): void {
        this.providers.set(debugType, provider);
    }

    listDebugConfigurationProviders(): string[] {
        return Array.from(this.providers.keys());
    }

    provideDebugConfiguration(debugType: string): DebugConfiguration[] {
        const provider = this.providers.get(debugType);
        return provider ? provider.provideDebugConfigurations() : [];
    }

    resolveDebugConfiguration(debugType: string, config: DebugConfiguration): DebugConfiguration | undefined {
        const provider = this.providers.get(debugType);
        return provider ? provider.resolveDebugConfiguration(config) : undefined;
    }

    provideDebugAdapterExecutable(debugType: string, config: DebugConfiguration): DebugAdapterExecutable | undefined {
        const provider = this.providers.get(debugType);
        if (provider && typeof provider.provideDebugAdapterExecutable !== "undefined") {
            return provider.provideDebugAdapterExecutable(config);
        }
    }
}

/**
 * DebugSessionManager symbol for DI.
 */
export const DebugSessionManager = Symbol('DebugSessionManager');

/**
 * [Debug session](#DebugSession) manager.
 */
export interface DebugSessionManager {
    /**
     * Creates [debug session](#DebugSession) for the specific debug type by resolved
     * debug configuration. The [debug session factory](#DebugSessionFactory) is used to instantiate the session.
     * @param debugType The registered debug type
     * @param config The debug configuration
     * @returns The session identifier
     */
    create(debugType: string, config: DebugConfiguration): string | undefined;

    /**
     * Removes [debug session](#DebugSession) from the list of the instantiated sessions.
     * Is invoked when session is terminated and isn't needed anymore.
     * @param sessionId The session identifier
     */
    remove(sessionId: string): void;

    /**
     * Finds the debug session by its id.
     * Returning the value 'undefined' means the session isn't found.
     * @param sessionId The session identifier
     * @returns The debug session
     */
    find(sessionId: string): DebugSession | undefined;

    /**
     * Finds all instantiated debug sessions.
     * @returns An array of debug sessions identifiers
     */
    findAll(): string[];
}

/**
 * DebugSessionManager implementation.
 */
@injectable()
export class DebugSessionManagerImpl implements DebugSessionManager, DebugSessionFactoryRegistry {
    protected readonly factories = new Map<string, DebugSessionFactory>();
    protected readonly sessions = new Map<string, DebugSession>();

    constructor(
        @inject(DebugConfigurationManager)
        protected readonly debugConfigurationManger: DebugConfigurationManager,
        @inject(ContributionProvider) @named(DebugSessionFactoryContribution)
        protected readonly contributions: ContributionProvider<DebugSessionFactoryContribution>
    ) {
        if (this.contributions) {
            for (const contrib of this.contributions.getContributions()) {
                contrib.registerDebugSessionFactory(this);
            }
        }
    }

    find(sessionId: string): DebugSession | undefined {
        return this.sessions.get(sessionId);
    }

    create(debugType: string, config: DebugConfiguration): string | undefined {
        const factory = this.factories.get(debugType);
        if (factory) {
            const session = factory.create(config);
            if (session) {
                const sessionId = UUID.uuid4();
                this.sessions.set(sessionId, session);
                return sessionId;
            }
        }

        const executable = this.debugConfigurationManger.provideDebugAdapterExecutable(debugType, config);
        if (executable) {
            const session = new DebugAdapterSession(executable);
            return this.register(session);
        }
    }

    remove(sessionId: string): void {
        this.sessions.delete(sessionId);
    }

    findAll(): string[] {
        return Array.from(this.sessions.keys());
    }

    registerDebugSessionFactory(debugType: string, factory: DebugSessionFactory): void {
        this.factories.set(debugType, factory);
    }

    private register(session: DebugSession): string {
        const sessionId = UUID.uuid4();
        this.sessions.set(sessionId, session);
        return sessionId;
    }
}

/**
 * DebugService implementation.
 */
@injectable()
export class DebugServiceImpl implements DebugService {
    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(DebugSessionManager)
    protected readonly debugSessionManager: DebugSessionManager;

    @inject(DebugConfigurationManager)
    protected readonly debugConfigurationManager: DebugConfigurationManager;

    async listDebugConfigurationProviders(): Promise<string[]> {
        return this.debugConfigurationManager.listDebugConfigurationProviders();
    }

    async provideDebugConfiguration(debugType: string): Promise<DebugConfiguration[]> {
        return this.debugConfigurationManager.provideDebugConfiguration(debugType);
    }

    async resolveDebugConfiguration(debugType: string, config: DebugConfiguration): Promise<DebugConfiguration | undefined> {
        return this.debugConfigurationManager.resolveDebugConfiguration(debugType, config);
    }

    async createDebugSession(debugType: string, config: DebugConfiguration): Promise<string | undefined> {
        return this.debugSessionManager.create(debugType, config);
    }

    async initialize(sessionId: string, request: DebugProtocol.InitializeRequest): Promise<DebugProtocol.InitializeResponse | undefined> {
        const session = this.debugSessionManager.find(sessionId);
        if (session) {
            return session.initialize(request);
        }
    }

    async runInTerminal(sessionId: string, request: DebugProtocol.RunInTerminalRequest): Promise<DebugProtocol.RunInTerminalResponse | undefined> {
        const session = this.debugSessionManager.find(sessionId);
        if (session) {
            return session.runInTerminal(request);
        }
    }

    async configurationDone(sessionId: string, request: DebugProtocol.ConfigurationDoneRequest): Promise<DebugProtocol.ConfigurationDoneResponse | undefined> {
        const session = this.debugSessionManager.find(sessionId);
        if (session) {
            return session.configurationDone(request);
        }
    }

    async launch(sessionId: string, request: DebugProtocol.LaunchRequest): Promise<DebugProtocol.LaunchResponse | undefined> {
        const session = this.debugSessionManager.find(sessionId);
        if (session) {
            return session.launch(request);
        }
    }

    async attach(sessionId: string, request: DebugProtocol.AttachRequest): Promise<DebugProtocol.AttachResponse | undefined> {
        const session = this.debugSessionManager.find(sessionId);
        if (session) {
            return session.attach(request);
        }
    }

    async restart(sessionId: string, request: DebugProtocol.RestartRequest): Promise<DebugProtocol.RestartResponse | undefined> {
        const session = this.debugSessionManager.find(sessionId);
        if (session) {
            return session.restart(request);
        }
    }

    async disconnect(sessionId: string, request: DebugProtocol.DisconnectRequest): Promise<DebugProtocol.DisconnectResponse | undefined> {
        const session = this.debugSessionManager.find(sessionId);
        if (session) {
            return session.disconnect(request);
        }
    }

    async setBreakpoint(sessionId: string, request: DebugProtocol.SetBreakpointsRequest): Promise<DebugProtocol.StepBackResponse | undefined> {
        const session = this.debugSessionManager.find(sessionId);
        if (session) {
            return session.setBreakpoint(request);
        }
    }

    async setFunctionBreakpoints(sessionId: string, request: DebugProtocol.SetFunctionBreakpointsRequest): Promise<DebugProtocol.SetFunctionBreakpointsResponse | undefined> {
        const session = this.debugSessionManager.find(sessionId);
        if (session) {
            return session.setFunctionBreakpoints(request);
        }
    }

    async setExceptionBreakpoints(sessionId: string, request: DebugProtocol.SetExceptionBreakpointsRequest): Promise<DebugProtocol.SetExceptionBreakpointsResponse | undefined> {
        const session = this.debugSessionManager.find(sessionId);
        if (session) {
            return session.setExceptionBreakpoints(request);
        }
    }

    async continue(sessionId: string, request: DebugProtocol.ContinueRequest): Promise<DebugProtocol.ContinueResponse | undefined> {
        const session = this.debugSessionManager.find(sessionId);
        if (session) {
            return session.continue(request);
        }
    }

    async next(sessionId: string, request: DebugProtocol.NextRequest): Promise<DebugProtocol.NextResponse | undefined> {
        const session = this.debugSessionManager.find(sessionId);
        if (session) {
            return session.next(request);
        }
    }

    async stepIn(sessionId: string, request: DebugProtocol.StepInRequest): Promise<DebugProtocol.StepInResponse | undefined> {
        const session = this.debugSessionManager.find(sessionId);
        if (session) {
            return session.stepIn(request);
        }
    }

    async stepOut(sessionId: string, request: DebugProtocol.StepOutRequest): Promise<DebugProtocol.StepOutResponse | undefined> {
        const session = this.debugSessionManager.find(sessionId);
        if (session) {
            return session.stepOut(request);
        }
    }

    async stepBack(sessionId: string, request: DebugProtocol.StepBackRequest): Promise<DebugProtocol.StepBackResponse | undefined> {
        const session = this.debugSessionManager.find(sessionId);
        if (session) {
            return session.stepBack(request);
        }
    }

    async reverseContinue(sessionId: string, request: DebugProtocol.ReverseContinueRequest): Promise<DebugProtocol.ReverseContinueResponse | undefined> {
        const session = this.debugSessionManager.find(sessionId);
        if (session) {
            return session.reverseContinue(request);
        }
    }

    async restartFrame(sessionId: string, request: DebugProtocol.RestartFrameRequest): Promise<DebugProtocol.RestartFrameResponse | undefined> {
        const session = this.debugSessionManager.find(sessionId);
        if (session) {
            return session.restartFrame(request);
        }
    }

    async goto(sessionId: string, request: DebugProtocol.GotoRequest): Promise<DebugProtocol.GotoResponse | undefined> {
        const session = this.debugSessionManager.find(sessionId);
        if (session) {
            return session.goto(request);
        }
    }

    async pause(sessionId: string, request: DebugProtocol.PauseRequest): Promise<DebugProtocol.PauseResponse | undefined> {
        const session = this.debugSessionManager.find(sessionId);
        if (session) {
            return session.pause(request);
        }
    }

    async stackTrace(sessionId: string, request: DebugProtocol.StackTraceRequest): Promise<DebugProtocol.StackTraceResponse | undefined> {
        const session = this.debugSessionManager.find(sessionId);
        if (session) {
            return session.stackTrace(request);
        }
    }

    async scope(sessionId: string, request: DebugProtocol.ScopesRequest): Promise<DebugProtocol.ScopesResponse | undefined> {
        const session = this.debugSessionManager.find(sessionId);
        if (session) {
            return session.scope(request);
        }
    }

    async variables(sessionId: string, request: DebugProtocol.VariablesRequest): Promise<DebugProtocol.VariablesResponse | undefined> {
        const session = this.debugSessionManager.find(sessionId);
        if (session) {
            return session.variables(request);
        }
    }

    async serVariable(sessionId: string, request: DebugProtocol.SetVariableRequest): Promise<DebugProtocol.SetVariableResponse | undefined> {
        const session = this.debugSessionManager.find(sessionId);
        if (session) {
            return session.serVariable(request);
        }
    }

    async source(sessionId: string, request: DebugProtocol.SourceRequest): Promise<DebugProtocol.SourceResponse | undefined> {
        const session = this.debugSessionManager.find(sessionId);
        if (session) {
            return session.source(request);
        }
    }

    async threads(sessionId: string, request: DebugProtocol.ThreadsRequest): Promise<DebugProtocol.ThreadsResponse | undefined> {
        const session = this.debugSessionManager.find(sessionId);
        if (session) {
            return session.threads(request);
        }
    }

    async modules(sessionId: string, request: DebugProtocol.ModulesRequest): Promise<DebugProtocol.ModulesResponse | undefined> {
        const session = this.debugSessionManager.find(sessionId);
        if (session) {
            return session.modules(request);
        }
    }

    async loadSources(sessionId: string, request: DebugProtocol.LoadedSourcesRequest): Promise<DebugProtocol.LoadedSourcesResponse | undefined> {
        const session = this.debugSessionManager.find(sessionId);
        if (session) {
            return session.loadSources(request);
        }
    }

    async evaluate(sessionId: string, request: DebugProtocol.EvaluateRequest): Promise<DebugProtocol.EvaluateResponse | undefined> {
        const session = this.debugSessionManager.find(sessionId);
        if (session) {
            return session.evaluate(request);
        }
    }

    async stepInTarget(sessionId: string, request: DebugProtocol.StepInTargetsRequest): Promise<DebugProtocol.StepInResponse | undefined> {
        const session = this.debugSessionManager.find(sessionId);
        if (session) {
            return session.stepInTarget(request);
        }
    }

    async gotoTargets(sessionId: string, request: DebugProtocol.GotoTargetsRequest): Promise<DebugProtocol.GotoTargetsResponse | undefined> {
        const session = this.debugSessionManager.find(sessionId);
        if (session) {
            return session.gotoTargets(request);
        }
    }

    async completions(sessionId: string, request: DebugProtocol.CompletionsRequest): Promise<DebugProtocol.CompletionsResponse | undefined> {
        const session = this.debugSessionManager.find(sessionId);
        if (session) {
            return session.completions(request);
        }
    }

    async exceptionInfo(sessionId: string, request: DebugProtocol.ExceptionInfoRequest): Promise<DebugProtocol.ExceptionInfoResponse | undefined> {
        const session = this.debugSessionManager.find(sessionId);
        if (session) {
            return session.exceptionInfo(request);
        }
    }

    async dispose(): Promise<void> { }
}
