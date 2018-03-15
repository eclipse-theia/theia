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

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Some entities copied and modified from https://github.com/Microsoft/vscode/blob/master/src/vs/vscode.d.ts
// Some entities copied and modified from https://github.com/Microsoft/vscode/blob/master/src/vs/workbench/parts/debug/common/debug.ts

import { Disposable } from '@theia/core';
import { DebugProtocol } from 'vscode-debugprotocol';

/**
 * The WS endpoint path to the Debug service.
 */
export const DebugPath = '/services/debug';

/**
 * DebugService symbol for DI.
 */
export const DebugService = Symbol('DebugService');

/**
 * Ties client and server providing functionality to debug applications.
 *
 * The workflow is the following. If user wants to debug an application and
 * there is no debug configuration associated with the application then
 * the list of available providers is requested to create suitable debug configuration.
 * When configuration is chosen the configuration provider is able to alter the configuration
 * by filling in missing values or by adding/changing/removing attributes. For this purpose the
 * #resolveDebugConfiguration method is invoked. At final stage the a debug session will be
 * created.
 */
export interface DebugService extends Disposable {
    /**
     * Finds and returns an array of registered debug types.
     * @returns An array of registered debug types
     */
    listDebugConfigurationProviders(): Promise<string[]>;

    /**
     * Provides initial [debug configuration](#DebugConfiguration). If more than one debug configuration provider is
     * registered for the same type, debug configurations are concatenated in arbitrary order.
     * @param debugType The registered debug type
     * @returns An array of [debug configurations](#DebugConfiguration)
     */
    provideDebugConfiguration(debugType: string): Promise<DebugConfiguration[]>;

    /**
      * Resolves a [debug configuration](#DebugConfiguration) by filling in missing values or by adding/changing/removing attributes.
      * If more than one debug configuration provider is registered for the same type, the #resolveDebugConfiguration calls are chained
      * in arbitrary order and the initial debug configuration is piped through the chain.
      * Returning the value 'undefined' prevents the debug session from starting.
      * @param debugType The registered debug type
      * @param debugConfiguration The [debug configuration](#DebugConfiguration) to resolve.
      * @returns The resolved debug configuration or undefined.
      */
    resolveDebugConfiguration(debugType: string, config: DebugConfiguration): Promise<DebugConfiguration | undefined>;

    /**
     * Creates a [debug session](#DebugSession) based on resolved configuration.
     * Creation doesn't imply starting a debugger itself but it is rather implementation specific.
     * Returning the value 'undefined' means the session can't be created.
     * @param debugType The debug type
     * @param config The [debug configuration](#DebugConfiguration) to create session based on
     * @returns The identifier of the created [debug session](#DebugSession)
     */
    createDebugSession(debugType: string, config: DebugConfiguration): Promise<string | undefined>;

    /**
     * Sends [request](#DebugProtocol.InitializeRequest) to the given [debug session](#DebugSession).
     * Returning the value 'undefined' means the session with the given identifier isn't found.
     * @param sessionId The session identifier
     * @param request The request to processed
     */
    initialize(sessionId: string, request: DebugProtocol.InitializeRequest): Promise<DebugProtocol.InitializeResponse | undefined>;

    /**
     * Sends [request](#DebugProtocol.RunInTerminalRequest) to the given [debug session](#DebugSession).
     * Returning the value 'undefined' means the session isn't found or request can't be processed.
     * @param sessionId The session identifier
     * @param request The request to processed
     */
    runInTerminal(sessionId: string, request: DebugProtocol.RunInTerminalRequest): Promise<DebugProtocol.RunInTerminalResponse | undefined>;

    /**
     * Sends [request](#DebugProtocol.ConfigurationDoneRequest) to the given [debug session](#DebugSession).
     * Returning the value 'undefined' means the session isn't found or request can't be processed.
     * @param sessionId The session identifier
     * @param request The request to processed
     */
    configurationDone(sessionId: string, request: DebugProtocol.ConfigurationDoneRequest): Promise<DebugProtocol.ConfigurationDoneResponse | undefined>;

    /**
     * Sends [request](#DebugProtocol.LaunchRequest) to the given [debug session](#DebugSession).
     * Returning the value 'undefined' means the session isn't found or request can't be processed.
     * @param sessionId The session identifier
     * @param request The request to processed
     */
    launch(sessionId: string, request: DebugProtocol.LaunchRequest): Promise<DebugProtocol.LaunchResponse | undefined>;

    /**
     * Sends [request](#DebugProtocol.AttachRequest) to the given [debug session](#DebugSession).
     * Returning the value 'undefined' means the session isn't found or request can't be processed.
     * @param sessionId The session identifier
     * @param request The request to processed
     */
    attach(sessionId: string, request: DebugProtocol.AttachRequest): Promise<DebugProtocol.AttachResponse | undefined>;

    /**
     * Sends [request](#DebugProtocol.RestartRequest) to the given [debug session](#DebugSession).
     * Returning the value 'undefined' means the session isn't found or request can't be processed.
     * @param sessionId The session identifier
     * @param request The request to processed
     */
    restart(sessionId: string, request: DebugProtocol.RestartRequest): Promise<DebugProtocol.RestartResponse | undefined>;

    /**
     * Sends [request](#DebugProtocol.DisconnectRequest) to the given [debug session](#DebugSession).
     * Returning the value 'undefined' means the session isn't found or request can't be processed.
     * @param sessionId The session identifier
     * @param request The request to processed
     */
    disconnect(sessionId: string, request: DebugProtocol.DisconnectRequest): Promise<DebugProtocol.DisconnectResponse | undefined>;

    /**
     * Sends [request](#DebugProtocol.SetBreakpointsRequest) to the given [debug session](#DebugSession).
     * Returning the value 'undefined' means the session isn't found or request can't be processed.
     * @param sessionId The session identifier
     * @param request The request to processed
     */
    setBreakpoint(sessionId: string, request: DebugProtocol.SetBreakpointsRequest): Promise<DebugProtocol.StepBackResponse | undefined>;

    /**
     * Sends [request](#DebugProtocol.SetFunctionBreakpointsRequest) to the given [debug session](#DebugSession).
     * Returning the value 'undefined' means the session isn't found or request can't be processed.
     * @param sessionId The session identifier
     * @param request The request to processed
     */
    setFunctionBreakpoints(sessionId: string, request: DebugProtocol.SetFunctionBreakpointsRequest): Promise<DebugProtocol.SetFunctionBreakpointsResponse | undefined>;

    /**
     * Sends [request](#DebugProtocol.SetExceptionBreakpointsRequest) to the given [debug session](#DebugSession).
     * Returning the value 'undefined' means the session isn't found or request can't be processed.
     * @param sessionId The session identifier
     * @param request The request to processed
     */
    setExceptionBreakpoints(sessionId: string, request: DebugProtocol.SetExceptionBreakpointsRequest): Promise<DebugProtocol.SetExceptionBreakpointsResponse | undefined>;

    /**
     * Sends [request](#DebugProtocol.ContinueRequest) to the given [debug session](#DebugSession).
     * Returning the value 'undefined' means the session isn't found or request can't be processed.
     * @param sessionId The session identifier
     * @param request The request to processed
     */
    continue(sessionId: string, request: DebugProtocol.ContinueRequest): Promise<DebugProtocol.ContinueResponse | undefined>;

    /**
     * Sends [request](#DebugProtocol.NextRequest) to the given [debug session](#DebugSession).
     * Returning the value 'undefined' means the session isn't found or request can't be processed.
     * @param sessionId The session identifier
     * @param request The request to processed
     */
    next(sessionId: string, request: DebugProtocol.NextRequest): Promise<DebugProtocol.NextResponse | undefined>;

    /**
     * Sends [request](#DebugProtocol.StepInRequest) to the given [debug session](#DebugSession).
     * Returning the value 'undefined' means the session isn't found or request can't be processed.
     * @param sessionId The session identifier
     * @param request The request to processed
     */
    stepIn(sessionId: string, request: DebugProtocol.StepInRequest): Promise<DebugProtocol.StepInResponse | undefined>;

    /**
     * Sends [request](#DebugProtocol.StepOutRequest) to the given [debug session](#DebugSession).
     * Returning the value 'undefined' means the session isn't found or request can't be processed.
     * @param sessionId The session identifier
     * @param request The request to processed
     */
    stepOut(sessionId: string, request: DebugProtocol.StepOutRequest): Promise<DebugProtocol.StepOutResponse | undefined>;

    /**
     * Sends [request](#DebugProtocol.StepBackRequest) to the given [debug session](#DebugSession).
     * Returning the value 'undefined' means the session isn't found or request can't be processed.
     * @param sessionId The session identifier
     * @param request The request to processed
     */
    stepBack(sessionId: string, request: DebugProtocol.StepBackRequest): Promise<DebugProtocol.StepBackResponse | undefined>;

    /**
     * Sends [request](#DebugProtocol.ReverseContinueRequest) to the given [debug session](#DebugSession).
     * Returning the value 'undefined' means the session isn't found or request can't be processed.
     * @param sessionId The session identifier
     * @param request The request to processed
     */
    reverseContinue(sessionId: string, request: DebugProtocol.ReverseContinueRequest): Promise<DebugProtocol.ReverseContinueResponse | undefined>;

    /**
     * Sends [request](#DebugProtocol.RestartFrameRequest) to the given [debug session](#DebugSession).
     * Returning the value 'undefined' means the session isn't found or request can't be processed.
     * @param sessionId The session identifier
     * @param request The request to processed
     */
    restartFrame(sessionId: string, request: DebugProtocol.RestartFrameRequest): Promise<DebugProtocol.RestartFrameResponse | undefined>;

    /**
     * Sends [request](#DebugProtocol.GotoRequest) to the given [debug session](#DebugSession).
     * Returning the value 'undefined' means the session isn't found or request can't be processed.
     * @param sessionId The session identifier
     * @param request The request to processed
     */
    goto(sessionId: string, request: DebugProtocol.GotoRequest): Promise<DebugProtocol.GotoResponse | undefined>;

    /**
     * Sends [request](#DebugProtocol.PauseRequest) to the given [debug session](#DebugSession).
     * Returning the value 'undefined' means the session isn't found or request can't be processed.
     * @param sessionId The session identifier
     * @param request The request to processed
     */
    pause(sessionId: string, request: DebugProtocol.PauseRequest): Promise<DebugProtocol.PauseResponse | undefined>;

    /**
     * Sends [request](#DebugProtocol.StackTraceRequest) to the given [debug session](#DebugSession).
     * Returning the value 'undefined' means the session isn't found or request can't be processed.
     * @param sessionId The session identifier
     * @param request The request to processed
     */
    stackTrace(sessionId: string, request: DebugProtocol.StackTraceRequest): Promise<DebugProtocol.StackTraceResponse | undefined>;

    /**
     * Sends [request](#DebugProtocol.ScopesRequest) to the given [debug session](#DebugSession).
     * Returning the value 'undefined' means the session isn't found or request can't be processed.
     * @param sessionId The session identifier
     * @param request The request to processed
     */
    scope(sessionId: string, request: DebugProtocol.ScopesRequest): Promise<DebugProtocol.ScopesResponse | undefined>;

    /**
     * Sends [request](#DebugProtocol.VariablesRequest) to the given [debug session](#DebugSession).
     * Returning the value 'undefined' means the session isn't found or request can't be processed.
     * @param sessionId The session identifier
     * @param request The request to processed
     */
    variables(sessionId: string, request: DebugProtocol.VariablesRequest): Promise<DebugProtocol.VariablesResponse | undefined>;

    /**
     * Sends [request](#DebugProtocol.SetVariableRequest) to the given [debug session](#DebugSession).
     * Returning the value 'undefined' means the session isn't found or request can't be processed.
     * @param sessionId The session identifier
     * @param request The request to processed
     */
    serVariable(sessionId: string, request: DebugProtocol.SetVariableRequest): Promise<DebugProtocol.SetVariableResponse | undefined>;

    /**
     * Sends [request](#DebugProtocol.SourceRequest) to the given [debug session](#DebugSession).
     * Returning the value 'undefined' means the session isn't found or request can't be processed.
     * @param sessionId The session identifier
     * @param request The request to processed
     */
    source(sessionId: string, request: DebugProtocol.SourceRequest): Promise<DebugProtocol.SourceResponse | undefined>;

    /**
     * Sends [request](#DebugProtocol.ThreadsRequest) to the given [debug session](#DebugSession).
     * Returning the value 'undefined' means the session isn't found or request can't be processed.
     * @param sessionId The session identifier
     * @param request The request to processed
     */
    threads(sessionId: string, request: DebugProtocol.ThreadsRequest): Promise<DebugProtocol.ThreadsResponse | undefined>;

    /**
     * Sends [request](#DebugProtocol.ModulesRequest) to the given [debug session](#DebugSession).
     * Returning the value 'undefined' means the session isn't found or request can't be processed.
     * @param sessionId The session identifier
     * @param request The request to processed
     */
    modules(sessionId: string, request: DebugProtocol.ModulesRequest): Promise<DebugProtocol.ModulesResponse | undefined>;

    /**
     * Sends [request](#DebugProtocol.LoadedSourcesRequest) to the given [debug session](#DebugSession).
     * Returning the value 'undefined' means the session isn't found or request can't be processed.
     * @param sessionId The session identifier
     * @param request The request to processed
     */
    loadSources(sessionId: string, request: DebugProtocol.LoadedSourcesRequest): Promise<DebugProtocol.LoadedSourcesResponse | undefined>;

    /**
     * Sends [request](#DebugProtocol.EvaluateRequest) to the given [debug session](#DebugSession).
     * Returning the value 'undefined' means the session isn't found or request can't be processed.
     * @param sessionId The session identifier
     * @param request The request to processed
     */
    evaluate(sessionId: string, request: DebugProtocol.EvaluateRequest): Promise<DebugProtocol.EvaluateResponse | undefined>;

    /**
     * Sends [request](#DebugProtocol.StepInTargetsRequest) to the given [debug session](#DebugSession).
     * Returning the value 'undefined' means the session isn't found or request can't be processed.
     * @param sessionId The session identifier
     * @param request The request to processed
     */
    stepInTarget(sessionId: string, request: DebugProtocol.StepInTargetsRequest): Promise<DebugProtocol.StepInResponse | undefined>;

    /**
     * Sends [request](#DebugProtocol.GotoTargetsRequest) to the given [debug session](#DebugSession).
     * Returning the value 'undefined' means the session isn't found or request can't be processed.
     * @param sessionId The session identifier
     * @param request The request to processed
     */
    gotoTargets(sessionId: string, request: DebugProtocol.GotoTargetsRequest): Promise<DebugProtocol.GotoTargetsResponse | undefined>;

    /**
     * Sends [request](#DebugProtocol.CompletionsRequest) to the given [debug session](#DebugSession).
     * Returning the value 'undefined' means the session isn't found or request can't be processed.
     * @param sessionId The session identifier
     * @param request The request to processed
     */
    completions(sessionId: string, request: DebugProtocol.CompletionsRequest): Promise<DebugProtocol.CompletionsResponse | undefined>;

    /**
     * Sends [request](#DebugProtocol.ExceptionInfoRequest) to the given [debug session](#DebugSession).
     * Returning the value 'undefined' means the session isn't found or request can't be processed.
     * @param sessionId The session identifier
     * @param request The request to processed
     */
    exceptionInfo(sessionId: string, request: DebugProtocol.ExceptionInfoRequest): Promise<DebugProtocol.ExceptionInfoResponse | undefined>;
}

/**
 * Contains a command line to start a debug adapter.
 */
export interface DebugAdapterExecutable {
    /**
     * The command to launch.
     */
    command: string;

    /**
     * The arguments.
     */
    args?: string[];
}

/**
 * A debug configuration provider allows to add the initial debug configurations
 * and to resolve a configuration before it is used to start a new debug session.
 * A debug configuration provider is registered into
 * [debug configuration registry](#DebugConfigurationRegistry) by its type.
 */
export interface DebugConfigurationProvider {
    /**
     * Provides initial [debug configuration](#DebugConfiguration). If more than one debug configuration provider is
     * registered for the same type, debug configurations are concatenated in arbitrary order.
     * @returns An array of [debug configurations](#DebugConfiguration).
     */
    provideDebugConfigurations(): DebugConfiguration[];

    /**
     * Resolves a [debug configuration](#DebugConfiguration) by filling in missing values or by adding/changing/removing attributes.
     * If more than one debug configuration provider is registered for the same type, the #resolveDebugConfiguration calls are chained
     * in arbitrary order and the initial debug configuration is piped through the chain.
     * Returning the value 'undefined' prevents the debug session from starting.
     * @param config The [debug configuration](#DebugConfiguration) to resolve.
     * @returns The resolved debug configuration or undefined.
     */
    resolveDebugConfiguration(config: DebugConfiguration): DebugConfiguration | undefined;

    /**
     * Provides a [command line](#DebugAdapterExecutable) based on [debug configuration](#DebugConfiguration)
     * to start a new debug adapter. Returning the value 'undefined' means that it is impossible
     * to construct a command line based on given debug configuration to start a debug adapter.
     * @param config The resolved [debug configuration](#DebugConfiguration).
     * @returns The [command line](#DebugAdapterExecutable).
     */
    provideDebugAdapterExecutable?(config: DebugConfiguration): DebugAdapterExecutable | undefined;
}

/**
 * The registry containing [debug configuration providers](#DebugConfigurationProvider).
 */
export interface DebugConfigurationProviderRegistry {

    /**
     * Registers provider by its type.
     * @param debugType The debug type
     * @param provider The configuration provider
     */
    registerDebugConfigurationProvider(debugType: string, provider: DebugConfigurationProvider): void;
}

/**
 * DebugConfigurationContribution symbol for DI.
 */
export const DebugConfigurationContribution = Symbol('DebugConfigurationContribution');

/**
 * The debug configuration contribution should be implemented to register configuration providers.
 */
export interface DebugConfigurationContribution {
    /**
     * Registers debug configuration provider.
     */
    registerDebugConfigurationProvider(registry: DebugConfigurationProviderRegistry): void;
}

/**
 * The registry containing [debug session factories](#DebugSessionFactory).
 */
export interface DebugSessionFactoryRegistry {
    /**
     * Registers factory by its type.
     * @param debugType The debug type
     * @param factory The debug session factory
     */
    registerDebugSessionFactory(debugType: string, factory: DebugSessionFactory): void;
}

/**
 * DebugSessionFactoryContribution symbol for DI.
 */
export const DebugSessionFactoryContribution = Symbol('DebugSessionFactoryContribution');

/**
 * The debug session factory contribution should be implemented to register session factories.
 */
export interface DebugSessionFactoryContribution {
    /**
     * Registers debug session factory.
     */
    registerDebugSessionFactory(registry: DebugSessionFactoryRegistry): void;
}

/**
 * Debug session instantiator. It is used to create session once
 * debug configuration is resolved. A debug session factory is registered into
 * [debug session factory registry](#DebugSessionFactoryRegistry) by its type.
 */
export interface DebugSessionFactory {
    /**
     * Creates a [debug session](#DebugSession) based on configuration.
     * Creation doesn't imply starting a debugger itself but it is rather implementation specific.
     * Returning the value 'undefined' means the session can't be created.
     * @param config The [debug configuration](#DebugConfiguration) to create session based on
     * @returns The debug session
     */
    create(config: DebugConfiguration): DebugSession | undefined;
}

/**
 * Configuration for a debug session.
 */
export interface DebugConfiguration {
    /**
     * The type of the debug session.
     */
    type: string;

    /**
     * The name of the debug session.
     */
    name: string;

    /**
     * Additional debug type specific properties.
     */
    [key: string]: any;
}

/**
 * The debug session.
 */
export interface DebugSession extends Disposable {
    runInTerminal(request: DebugProtocol.RunInTerminalRequest): DebugProtocol.RunInTerminalResponse | undefined;
    initialize(request: DebugProtocol.InitializeRequest): DebugProtocol.InitializeResponse | undefined;
    configurationDone(request: DebugProtocol.ConfigurationDoneRequest): DebugProtocol.ConfigurationDoneResponse | undefined;
    launch(request: DebugProtocol.LaunchRequest): DebugProtocol.LaunchResponse | undefined;
    attach(request: DebugProtocol.AttachRequest): DebugProtocol.AttachResponse | undefined;
    restart(request: DebugProtocol.RestartRequest): DebugProtocol.RestartResponse | undefined;
    disconnect(request: DebugProtocol.DisconnectRequest): DebugProtocol.DisconnectResponse | undefined;
    setBreakpoint(request: DebugProtocol.SetBreakpointsRequest): DebugProtocol.StepBackResponse | undefined;
    setFunctionBreakpoints(request: DebugProtocol.SetFunctionBreakpointsRequest): DebugProtocol.SetFunctionBreakpointsResponse | undefined;
    setExceptionBreakpoints(request: DebugProtocol.SetExceptionBreakpointsRequest): DebugProtocol.SetExceptionBreakpointsResponse | undefined;
    continue(request: DebugProtocol.ContinueRequest): DebugProtocol.ContinueResponse | undefined;
    next(request: DebugProtocol.NextRequest): DebugProtocol.NextResponse | undefined;
    stepIn(request: DebugProtocol.StepInRequest): DebugProtocol.StepInResponse | undefined;
    stepOut(request: DebugProtocol.StepOutRequest): DebugProtocol.StepOutResponse | undefined;
    stepBack(request: DebugProtocol.StepBackRequest): DebugProtocol.StepBackResponse | undefined;
    reverseContinue(request: DebugProtocol.ReverseContinueRequest): DebugProtocol.ReverseContinueResponse | undefined;
    restartFrame(request: DebugProtocol.RestartFrameRequest): DebugProtocol.RestartFrameResponse | undefined;
    goto(request: DebugProtocol.GotoRequest): DebugProtocol.GotoResponse | undefined;
    pause(request: DebugProtocol.PauseRequest): DebugProtocol.PauseResponse | undefined;
    stackTrace(request: DebugProtocol.StackTraceRequest): DebugProtocol.StackTraceResponse | undefined;
    scope(request: DebugProtocol.ScopesRequest): DebugProtocol.ScopesResponse | undefined;
    variables(request: DebugProtocol.VariablesRequest): DebugProtocol.VariablesResponse | undefined;
    serVariable(request: DebugProtocol.SetVariableRequest): DebugProtocol.SetVariableResponse | undefined;
    source(request: DebugProtocol.SourceRequest): DebugProtocol.SourceResponse | undefined;
    threads(request: DebugProtocol.ThreadsRequest): DebugProtocol.ThreadsResponse | undefined;
    modules(request: DebugProtocol.ModulesRequest): DebugProtocol.ModulesResponse | undefined;
    loadSources(request: DebugProtocol.LoadedSourcesRequest): DebugProtocol.LoadedSourcesResponse | undefined;
    evaluate(request: DebugProtocol.EvaluateRequest): DebugProtocol.EvaluateResponse | undefined;
    stepInTarget(request: DebugProtocol.StepInTargetsRequest): DebugProtocol.StepInResponse | undefined;
    gotoTargets(request: DebugProtocol.GotoTargetsRequest): DebugProtocol.GotoTargetsResponse | undefined;
    completions(request: DebugProtocol.CompletionsRequest): DebugProtocol.CompletionsResponse | undefined;
    exceptionInfo(request: DebugProtocol.ExceptionInfoRequest): DebugProtocol.ExceptionInfoResponse | undefined;
}
