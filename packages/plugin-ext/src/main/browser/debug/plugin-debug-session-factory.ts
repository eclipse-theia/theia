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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { DefaultDebugSessionFactory } from '@theia/debug/lib/browser/debug-session-contribution';
import { TerminalService } from '@theia/terminal/lib/browser/base/terminal-service';
import { EditorManager } from '@theia/editor/lib/browser/editor-manager';
import { BreakpointManager } from '@theia/debug/lib/browser/breakpoint/breakpoint-manager';
import { LabelProvider } from '@theia/core/lib/browser/label-provider';
import { MessageClient } from '@theia/core/lib/common/message-service-protocol';
import { OutputChannelManager } from '@theia/output/lib/browser/output-channel';
import { DebugPreferences } from '@theia/debug/lib/browser/debug-preferences';
import { DebugSessionOptions } from '@theia/debug/lib/browser/debug-session-options';
import { DebugSession } from '@theia/debug/lib/browser/debug-session';
import { DebugSessionConnection } from '@theia/debug/lib/browser/debug-session-connection';
import { TerminalWidgetOptions, TerminalWidget } from '@theia/terminal/lib/browser/base/terminal-widget';
import { TerminalOptionsExt } from '../../../common/plugin-api-rpc';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { DebugContribution } from '@theia/debug/lib/browser/debug-contribution';
import { ContributionProvider } from '@theia/core/lib/common/contribution-provider';
import { Channel } from '@theia/core/lib/common/message-rpc/channel';

export class PluginDebugSession extends DebugSession {
    constructor(
        override readonly id: string,
        override readonly options: DebugSessionOptions,
        override readonly parentSession: DebugSession | undefined,
        protected override readonly connection: DebugSessionConnection,
        protected override readonly terminalServer: TerminalService,
        protected override readonly editorManager: EditorManager,
        protected override readonly breakpoints: BreakpointManager,
        protected override readonly labelProvider: LabelProvider,
        protected override readonly messages: MessageClient,
        protected override readonly fileService: FileService,
        protected readonly terminalOptionsExt: TerminalOptionsExt | undefined,
        protected override readonly debugContributionProvider: ContributionProvider<DebugContribution>) {
        super(id, options, parentSession, connection, terminalServer, editorManager, breakpoints, labelProvider, messages, fileService, debugContributionProvider);
    }

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
        protected override readonly terminalService: TerminalService,
        protected override readonly editorManager: EditorManager,
        protected override readonly breakpoints: BreakpointManager,
        protected override readonly labelProvider: LabelProvider,
        protected override readonly messages: MessageClient,
        protected override readonly outputChannelManager: OutputChannelManager,
        protected override readonly debugPreferences: DebugPreferences,
        protected readonly connectionFactory: (sessionId: string) => Promise<Channel>,
        protected override readonly fileService: FileService,
        protected readonly terminalOptionsExt: TerminalOptionsExt | undefined,
        protected override readonly debugContributionProvider: ContributionProvider<DebugContribution>
    ) {
        super();
    }

    override get(sessionId: string, options: DebugSessionOptions, parentSession?: DebugSession): DebugSession {
        const connection = new DebugSessionConnection(
            sessionId,
            this.connectionFactory,
            this.getTraceOutputChannel());

        return new PluginDebugSession(
            sessionId,
            options,
            parentSession,
            connection,
            this.terminalService,
            this.editorManager,
            this.breakpoints,
            this.labelProvider,
            this.messages,
            this.fileService,
            this.terminalOptionsExt,
            this.debugContributionProvider
        );
    }
}
