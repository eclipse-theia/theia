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

import { injectable, inject } from 'inversify';
import { MessageClient } from '@theia/core/lib/common';
import { LabelProvider } from '@theia/core/lib/browser';
import { EditorManager } from '@theia/editor/lib/browser';
import { TerminalService } from '@theia/terminal/lib/browser/base/terminal-service';
import { WebSocketConnectionProvider } from '@theia/core/lib/browser/messaging/ws-connection-provider';
import { DebugConfiguration } from '../common/debug-configuration';
import { DebugSession } from './debug-session';
import { BreakpointManager } from './breakpoint/breakpoint-manager';

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

@injectable()
export class DefaultDebugSessionFactory implements DebugSessionFactory {

    @inject(WebSocketConnectionProvider)
    protected readonly connectionProvider: WebSocketConnectionProvider;

    @inject(TerminalService)
    protected readonly terminalService: TerminalService;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(BreakpointManager)
    protected readonly breakpoints: BreakpointManager;

    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;

    @inject(MessageClient)
    protected readonly messages: MessageClient;

    get(sessionId: string, debugConfiguration: DebugConfiguration): DebugSession {
        return new DebugSession(
            sessionId,
            debugConfiguration,
            this.connectionProvider,
            this.terminalService,
            this.editorManager,
            this.breakpoints,
            this.labelProvider,
            this.messages
        );
    }
}
