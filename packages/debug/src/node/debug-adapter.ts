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

import {
    DebugSession,
    DebugAdapterExecutable,
} from "../common/debug-model";
import { DebugProtocol } from "vscode-debugprotocol";

export class DebugAdapterSession implements DebugSession {
    constructor(protected readonly debugAdapterExecutable: DebugAdapterExecutable) { }

    runInTerminal(request: DebugProtocol.RunInTerminalRequest): DebugProtocol.RunInTerminalResponse | undefined {
        throw new Error("Method not implemented.");
    }

    initialize(request: DebugProtocol.InitializeRequest): DebugProtocol.InitializeResponse | undefined {
        throw new Error("Method not implemented.");
    }

    configurationDone(request: DebugProtocol.ConfigurationDoneRequest): DebugProtocol.ConfigurationDoneResponse | undefined {
        throw new Error("Method not implemented.");
    }

    launch(request: DebugProtocol.LaunchRequest): DebugProtocol.LaunchResponse | undefined {
        throw new Error("Method not implemented.");
    }

    attach(request: DebugProtocol.AttachRequest): DebugProtocol.AttachResponse | undefined {
        throw new Error("Method not implemented.");
    }

    restart(request: DebugProtocol.RestartRequest): DebugProtocol.RestartResponse | undefined {
        throw new Error("Method not implemented.");
    }

    disconnect(request: DebugProtocol.DisconnectRequest): DebugProtocol.DisconnectResponse | undefined {
        throw new Error("Method not implemented.");
    }

    setBreakpoint(request: DebugProtocol.SetBreakpointsRequest): DebugProtocol.StepBackResponse | undefined {
        throw new Error("Method not implemented.");
    }

    setFunctionBreakpoints(request: DebugProtocol.SetFunctionBreakpointsRequest): DebugProtocol.SetFunctionBreakpointsResponse | undefined {
        throw new Error("Method not implemented.");
    }

    setExceptionBreakpoints(request: DebugProtocol.SetExceptionBreakpointsRequest): DebugProtocol.SetExceptionBreakpointsResponse | undefined {
        throw new Error("Method not implemented.");
    }

    continue(request: DebugProtocol.ContinueRequest): DebugProtocol.ContinueResponse | undefined {
        throw new Error("Method not implemented.");
    }

    next(request: DebugProtocol.NextRequest): DebugProtocol.NextResponse | undefined {
        throw new Error("Method not implemented.");
    }

    stepIn(request: DebugProtocol.StepInRequest): DebugProtocol.StepInResponse | undefined {
        throw new Error("Method not implemented.");
    }

    stepOut(request: DebugProtocol.StepOutRequest): DebugProtocol.StepOutResponse | undefined {
        throw new Error("Method not implemented.");
    }

    stepBack(request: DebugProtocol.StepBackRequest): DebugProtocol.StepBackResponse | undefined {
        throw new Error("Method not implemented.");
    }

    reverseContinue(request: DebugProtocol.ReverseContinueRequest): DebugProtocol.ReverseContinueResponse | undefined {
        throw new Error("Method not implemented.");
    }

    restartFrame(request: DebugProtocol.RestartFrameRequest): DebugProtocol.RestartFrameResponse | undefined {
        throw new Error("Method not implemented.");
    }
    goto(request: DebugProtocol.GotoRequest): DebugProtocol.GotoResponse | undefined {
        throw new Error("Method not implemented.");
    }

    pause(request: DebugProtocol.PauseRequest): DebugProtocol.PauseResponse | undefined {
        throw new Error("Method not implemented.");
    }

    stackTrace(request: DebugProtocol.StackTraceRequest): DebugProtocol.StackTraceResponse | undefined {
        throw new Error("Method not implemented.");
    }

    scope(request: DebugProtocol.ScopesRequest): DebugProtocol.ScopesResponse | undefined {
        throw new Error("Method not implemented.");
    }

    variables(request: DebugProtocol.VariablesRequest): DebugProtocol.VariablesResponse | undefined {
        throw new Error("Method not implemented.");
    }

    serVariable(request: DebugProtocol.SetVariableRequest): DebugProtocol.SetVariableResponse | undefined {
        throw new Error("Method not implemented.");
    }

    source(request: DebugProtocol.SourceRequest): DebugProtocol.SourceResponse | undefined {
        throw new Error("Method not implemented.");
    }

    threads(request: DebugProtocol.ThreadsRequest): DebugProtocol.ThreadsResponse | undefined {
        throw new Error("Method not implemented.");
    }

    modules(request: DebugProtocol.ModulesRequest): DebugProtocol.ModulesResponse | undefined {
        throw new Error("Method not implemented.");
    }

    loadSources(request: DebugProtocol.LoadedSourcesRequest): DebugProtocol.LoadedSourcesResponse | undefined {
        throw new Error("Method not implemented.");
    }

    evaluate(request: DebugProtocol.EvaluateRequest): DebugProtocol.EvaluateResponse | undefined {
        throw new Error("Method not implemented.");
    }

    stepInTarget(request: DebugProtocol.StepInTargetsRequest): DebugProtocol.StepInResponse | undefined {
        throw new Error("Method not implemented.");
    }

    gotoTargets(request: DebugProtocol.GotoTargetsRequest): DebugProtocol.GotoTargetsResponse | undefined {
        throw new Error("Method not implemented.");
    }

    completions(request: DebugProtocol.CompletionsRequest): DebugProtocol.CompletionsResponse | undefined {
        throw new Error("Method not implemented.");
    }

    exceptionInfo(request: DebugProtocol.ExceptionInfoRequest): DebugProtocol.ExceptionInfoResponse | undefined {
        throw new Error("Method not implemented.");
    }

    dispose(): void {
        throw new Error("Method not implemented.");
    }
}
