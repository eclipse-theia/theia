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

import { DebugConfiguration, DebugSessionState } from "../common/debug-common";
import { Disposable } from "@theia/core";
import { DebugProtocol } from "vscode-debugprotocol";

/**
 * DebugSession symbol for DI.
 */
export const DebugSession = Symbol("DebugSession");

/**
 * The debug session.
 */
export interface DebugSession extends Disposable, NodeJS.EventEmitter {
    readonly sessionId: string;
    readonly configuration: DebugConfiguration;
    readonly state: DebugSessionState;

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
}

/**
 * DebugSessionFactory symbol for DI.
 */
export const DebugSessionFactory = Symbol("DebugSessionFactory");

/**
 * The [debug session](#DebugSession) factory.
 */
export interface DebugSessionFactory {
    get(sessionId: string, debugConfiguration: DebugConfiguration): DebugSession;
}

/**
 * DebugSessionContribution symbol for DI.
 */
export const DebugSessionContribution = Symbol("DebugSessionContribution");

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

/**
 * BreakpointManager symbol for DI.
 */
export const BreakpointManager = Symbol("BreakpointManager");

/**
 * The breakpoint manager;
 */
export interface BreakpointManager { }

export namespace Debug {
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
        clientID: "Theia",
        clientName: "Theia",
        locale: "",
        linesStartAt1: true,
        columnsStartAt1: true,
        pathFormat: "path",
        supportsVariableType: false,
        supportsVariablePaging: false,
        supportsRunInTerminalRequest: false
    };
}
