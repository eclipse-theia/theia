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

import { BreakpointManager, DebugSession } from "./debug-model";
import { DebugSessionManager } from "./debug-session";
import { injectable, inject } from "inversify";
import { DebugProtocol } from "vscode-debugprotocol";
import { SourceOpener } from "./debug-browser-utils";
import { FrontendApplicationContribution } from "@theia/core/lib/browser";

/**
 * The breakpoint manager implementation.
 */
@injectable()
export class BreakpointManagerImpl implements BreakpointManager, FrontendApplicationContribution {
    constructor(
        @inject(DebugSessionManager) protected readonly debugSessionManager: DebugSessionManager,
        @inject(SourceOpener) protected readonly sourceOpener: SourceOpener
    ) {
        this.debugSessionManager.onDidCreateDebugSession(debugSession => this.onDebugSessionCreated(debugSession));
    }

    onStart(): void { }

    protected onDebugSessionCreated(debugSession: DebugSession) {
        debugSession.on('stopped', event => this.onStopped(debugSession, event));
    }

    private onStopped(debugSession: DebugSession, event: DebugProtocol.StoppedEvent): void {
        const body = event.body;

        if (body.threadId) {
            switch (body.reason) {
                case 'breakpoint':
                case 'entry':
                case 'step': {
                    const args: DebugProtocol.StackTraceArguments = {
                        threadId: body.threadId,
                        startFrame: 0,
                        levels: 1
                    };
                    debugSession.stacks(args).then(response => this.sourceOpener.open(debugSession, response.body.stackFrames[0]));
                    break;
                }
            }
        }
    }
}
