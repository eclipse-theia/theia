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

import { injectable, inject, interfaces } from '@theia/core/shared/inversify';
import { DefaultDebugSessionFactory } from '@theia/debug/lib/browser/debug-session-contribution';
import { DebugConfigurationSessionOptions } from '@theia/debug/lib/browser/debug-session-options';
import { DebugSession, DebugSessionData } from '@theia/debug/lib/browser/debug-session';
import { DebugSessionConnection } from '@theia/debug/lib/browser/debug-session-connection';
import { TerminalWidgetOptions, TerminalWidget } from '@theia/terminal/lib/browser/base/terminal-widget';
import { TerminalOptionsExt } from '../../../common/plugin-api-rpc';
import { PluginChannel } from '../../../common/connection';

export const PluginTerminalOptionsExt = Symbol('PluginTerminalOptionsExt');

@injectable()
export class PluginDebugSession extends DebugSession {

    static override createContainer(
        parent: interfaces.Container, data: DebugSessionData, connection: DebugSessionConnection, terminalOptionsExt?: TerminalOptionsExt
    ): interfaces.Container {
        const child = DebugSession.createContainer(parent, data, connection);
        child.rebind(DebugSession).to(PluginDebugSession);
        child.bind(PluginTerminalOptionsExt).toConstantValue(terminalOptionsExt);
        return child;
    }

    @inject(PluginTerminalOptionsExt)
    protected readonly terminalOptionsExt: TerminalOptionsExt | undefined;

    protected override async doCreateTerminal(terminalWidgetOptions: TerminalWidgetOptions): Promise<TerminalWidget> {
        terminalWidgetOptions = Object.assign({}, terminalWidgetOptions, this.terminalOptionsExt);
        return super.doCreateTerminal(terminalWidgetOptions);
    }
}

/**
 * Session factory for a client debug session that communicates with debug adapter contributed as plugin.
 * The main difference is to use a connection factory that creates [Channel](#Channel) over Rpc channel.
 */
export class PluginDebugSessionFactory extends DefaultDebugSessionFactory {
    constructor(
        protected readonly connectionFactory: (sessionId: string) => Promise<PluginChannel>,
        protected readonly terminalOptionsExt: TerminalOptionsExt | undefined,
        container: interfaces.Container,
    ) {
        super(container);
    }

    override createSession(sessionId: string, options: DebugConfigurationSessionOptions, parentSession?: DebugSession): DebugSession {
        const connection = new DebugSessionConnection(
            sessionId,
            this.connectionFactory,
            this.getTraceOutputChannel());
        const data: DebugSessionData = {
            id: sessionId,
            options,
            parentSession,
        };
        const child = PluginDebugSession.createContainer(this.container, data, connection, this.terminalOptionsExt);
        return child.get(DebugSession);
    }
}
