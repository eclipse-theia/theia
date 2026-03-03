// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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

import { ChatResponsePartRenderer } from '@theia/ai-chat-ui/lib/browser/chat-response-part-renderer';
import { Agent } from '@theia/ai-core/lib/common';
import { bindToolProvider } from '@theia/ai-core/lib/common/tool-invocation-registry';
import { CommandContribution, MenuContribution, PreferenceContribution } from '@theia/core';
import { KeybindingContribution, WebSocketConnectionProvider } from '@theia/core/lib/browser';
import { ContainerModule } from '@theia/core/shared/inversify';
import { AiTerminalAgent } from './ai-terminal-agent';
import { AiTerminalCommandContribution } from './ai-terminal-contribution';
import { ShellExecutionTool } from './shell-execution-tool';
import { ShellExecutionToolRenderer } from './shell-execution-tool-renderer';
import { ShellExecutionServer, shellExecutionPath } from '../common/shell-execution-server';
import { ShellCommandPermissionService } from './shell-command-permission-service';
import { shellCommandPreferences } from '../common/shell-command-preferences';
import { DefaultShellCommandAnalyzer, ShellCommandAnalyzer } from '../common/shell-command-analyzer';

import '../../src/browser/style/ai-terminal.css';
import '../../src/browser/style/shell-execution-tool.css';

export default new ContainerModule(bind => {
    bind(AiTerminalCommandContribution).toSelf().inSingletonScope();
    for (const identifier of [CommandContribution, MenuContribution, KeybindingContribution]) {
        bind(identifier).toService(AiTerminalCommandContribution);
    }

    bind(AiTerminalAgent).toSelf().inSingletonScope();
    bind(Agent).toService(AiTerminalAgent);

    bindToolProvider(ShellExecutionTool, bind);

    bind(ShellExecutionServer).toDynamicValue(ctx => {
        const connection = ctx.container.get(WebSocketConnectionProvider);
        return connection.createProxy<ShellExecutionServer>(shellExecutionPath);
    }).inSingletonScope();

    bind(ChatResponsePartRenderer).to(ShellExecutionToolRenderer).inSingletonScope();

    bind(ShellCommandPermissionService).toSelf().inSingletonScope();

    bind(PreferenceContribution).toConstantValue({ schema: shellCommandPreferences });

    bind(ShellCommandAnalyzer).to(DefaultShellCommandAnalyzer).inSingletonScope();
});
