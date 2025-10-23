// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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

import { ChatAgent } from '@theia/ai-chat';
import { ChatResponsePartRenderer } from '@theia/ai-chat-ui/lib/browser/chat-response-part-renderer';
import { Agent } from '@theia/ai-core';
import { PreferenceContribution } from '@theia/core';
import { RemoteConnectionProvider, ServiceConnectionProvider } from '@theia/core/lib/browser';
import { ContainerModule } from '@theia/core/shared/inversify';
import {
    CODEX_SERVICE_PATH,
    CodexClient,
    CodexService
} from '../common/codex-service';
import { CodexPreferencesSchema } from '../common/codex-preferences';
import { CodexChatAgent } from './codex-chat-agent';
import { CodexClientImpl, CodexFrontendService } from './codex-frontend-service';
import { CommandExecutionRenderer } from './renderers/command-execution-renderer';
import { TodoListRenderer } from './renderers/todo-list-renderer';
import { WebSearchRenderer } from './renderers/web-search-renderer';
import '../../src/browser/style/codex-tool-renderers.css';

export default new ContainerModule(bind => {
    bind(PreferenceContribution).toConstantValue({ schema: CodexPreferencesSchema });

    bind(CodexFrontendService).toSelf().inSingletonScope();
    bind(CodexClientImpl).toSelf().inSingletonScope();
    bind(CodexClient).toService(CodexClientImpl);

    bind(CodexService).toDynamicValue(ctx => {
        const connection = ctx.container.get<ServiceConnectionProvider>(RemoteConnectionProvider);
        const backendClient: CodexClient = ctx.container.get(CodexClient);
        return connection.createProxy(CODEX_SERVICE_PATH, backendClient);
    }).inSingletonScope();

    bind(CodexChatAgent).toSelf().inSingletonScope();
    bind(Agent).toService(CodexChatAgent);
    bind(ChatAgent).toService(CodexChatAgent);

    bind(CommandExecutionRenderer).toSelf().inSingletonScope();
    bind(ChatResponsePartRenderer).toService(CommandExecutionRenderer);

    bind(TodoListRenderer).toSelf().inSingletonScope();
    bind(ChatResponsePartRenderer).toService(TodoListRenderer);

    bind(WebSearchRenderer).toSelf().inSingletonScope();
    bind(ChatResponsePartRenderer).toService(WebSearchRenderer);
});
