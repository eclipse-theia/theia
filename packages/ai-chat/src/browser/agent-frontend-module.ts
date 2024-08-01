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

import { Agent } from '@theia/ai-core/lib/common';
import { bindContributionProvider, CommandContribution } from '@theia/core';
import { ContainerModule } from '@theia/core/shared/inversify';
import {
    ChatAgent,
    ChatAgentService,
    ChatAgentServiceImpl,
    ChatRequestParser,
    ChatRequestParserImpl,
    ChatService,
    ChatServiceImpl,
    DefaultChatAgent,
    DummyChatAgent
} from '../common';
import { DummyCommandContribution } from './dummy-command-contribution';
import { MockCodeChatAgent } from '../common/mock-code-chat-agent';
import { CommandChatAgent } from '../common/command-chat-agents';

export default new ContainerModule(bind => {
    bindContributionProvider(bind, Agent);
    bindContributionProvider(bind, ChatAgent);

    bind(ChatAgentServiceImpl).toSelf().inSingletonScope();
    bind(ChatAgentService).toService(ChatAgentServiceImpl);

    bind(ChatRequestParserImpl).toSelf().inSingletonScope();
    bind(ChatRequestParser).toService(ChatRequestParserImpl);

    bind(ChatServiceImpl).toSelf().inSingletonScope();
    bind(ChatService).toService(ChatServiceImpl);

    bind(DefaultChatAgent).toSelf().inSingletonScope();
    bind(Agent).toService(DefaultChatAgent);
    bind(ChatAgent).toService(DefaultChatAgent);

    bind(MockCodeChatAgent).toSelf().inSingletonScope();
    bind(ChatAgent).toService(MockCodeChatAgent);
    bind(DummyChatAgent).toSelf().inSingletonScope();
    bind(Agent).toService(DummyChatAgent);
    bind(ChatAgent).toService(DummyChatAgent);
    bind(CommandChatAgent).toSelf().inSingletonScope();
    bind(Agent).toService(CommandChatAgent);
    bind(ChatAgent).toService(CommandChatAgent);

    bind(CommandContribution).to(DummyCommandContribution);
});
