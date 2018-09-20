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

import { DebugConfiguration, DebugSessionState } from '../common/debug-common';
import { Event, Disposable } from '@theia/core';
import { DebugProtocol } from 'vscode-debugprotocol';

/**
 * Stack frame format.
 */
export const DEFAULT_STACK_FRAME_FORMAT: DebugProtocol.StackFrameFormat = {
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
export const INITIALIZE_ARGUMENTS = {
    clientID: 'Theia',
    clientName: 'Theia IDE',
    locale: 'en-US',
    linesStartAt1: true,
    columnsStartAt1: true,
    pathFormat: 'path',
    supportsVariableType: false,
    supportsVariablePaging: false,
    supportsRunInTerminalRequest: true
};

/**
 * DebugSession symbol for DI.
 */
export const DebugSession = Symbol('DebugSession');

/**
 * The debug session.
 */
// FIXME get rid of NodeJS.EventEmitter, replace with core events
export interface DebugSession extends Disposable, NodeJS.EventEmitter {
    readonly sessionId: string;
    readonly configuration: DebugConfiguration;
    readonly state: DebugSessionState;
    readonly onDidOutput: Event<DebugProtocol.OutputEvent>;

    initialize(args: DebugProtocol.InitializeRequestArguments): Promise<DebugProtocol.InitializeResponse>;
    configurationDone(): Promise<DebugProtocol.ConfigurationDoneResponse>;
    attach(args: DebugProtocol.AttachRequestArguments): Promise<DebugProtocol.AttachResponse>;
    launch(args: DebugProtocol.LaunchRequestArguments): Promise<DebugProtocol.LaunchResponse>;
    threads(): Promise<DebugProtocol.ThreadsResponse>;
    stacks(args: DebugProtocol.StackTraceArguments): Promise<DebugProtocol.StackTraceResponse>;
    pause(args: DebugProtocol.PauseArguments): Promise<DebugProtocol.PauseResponse>;
    pauseAll(): Promise<DebugProtocol.PauseResponse[]>;
    resume(args: DebugProtocol.ContinueArguments): Promise<DebugProtocol.ContinueResponse>;
    resumeAll(): Promise<DebugProtocol.ContinueResponse[]>;
    disconnect(): Promise<DebugProtocol.InitializeResponse>;
    scopes(args: DebugProtocol.ScopesArguments): Promise<DebugProtocol.ScopesResponse>;
    variables(args: DebugProtocol.VariablesArguments): Promise<DebugProtocol.VariablesResponse>;
    setVariable(args: DebugProtocol.SetVariableArguments): Promise<DebugProtocol.SetVariableResponse>;
    evaluate(args: DebugProtocol.EvaluateArguments): Promise<DebugProtocol.EvaluateResponse>;
    source(args: DebugProtocol.SourceArguments): Promise<DebugProtocol.SourceResponse>;
    setBreakpoints(args: DebugProtocol.SetBreakpointsArguments): Promise<DebugProtocol.SetBreakpointsResponse>;
    next(args: DebugProtocol.NextArguments): Promise<DebugProtocol.NextResponse>;
    stepIn(args: DebugProtocol.StepInArguments): Promise<DebugProtocol.StepInResponse>;
    stepOut(args: DebugProtocol.StepOutArguments): Promise<DebugProtocol.StepOutResponse>;
    loadedSources(args: DebugProtocol.LoadedSourcesArguments): Promise<DebugProtocol.LoadedSourcesResponse>;
    completions(args: DebugProtocol.CompletionsArguments): Promise<DebugProtocol.CompletionsResponse>;
}

/**
 * DebugSessionFactory symbol for DI.
 */
export const DebugSessionFactory = Symbol('DebugSessionFactory');

/**
 * The [debug session](#DebugSession) factory.
 */
export interface DebugSessionFactory {
    get(sessionId: string, debugConfiguration: DebugConfiguration): DebugSession;
}

/**
 * DebugSessionContribution symbol for DI.
 */
export const DebugSessionContribution = Symbol('DebugSessionContribution');

/**
 * The [debug session](#DebugSession) contribution.
 * Can be used to instantiate a specific debug sessions.
 */
export interface DebugSessionContribution {
    /**
     * The debug type.
     */
    debugType: string;

    /**
     * The [debug session](#DebugSession) factory.
     */
    debugSessionFactory(): DebugSessionFactory;
}
