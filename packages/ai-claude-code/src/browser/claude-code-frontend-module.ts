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
import { CommandContribution, PreferenceContribution } from '@theia/core';
import { FrontendApplicationContribution, RemoteConnectionProvider, ServiceConnectionProvider } from '@theia/core/lib/browser';
import { ContainerModule } from '@theia/core/shared/inversify';
import '../../src/browser/style/claude-code-tool-renderers.css';
import {
    CLAUDE_CODE_SERVICE_PATH,
    ClaudeCodeClient,
    ClaudeCodeService
} from '../common/claude-code-service';
import { ClaudeCodePreferencesSchema } from '../common/claude-code-preferences';
import { ClaudeCodeChatAgent } from './claude-code-chat-agent';
import { ClaudeCodeEditToolService, ClaudeCodeEditToolServiceImpl } from './claude-code-edit-tool-service';
import { FileEditBackupService, FileEditBackupServiceImpl } from './claude-code-file-edit-backup-service';
import { ClaudeCodeClientImpl, ClaudeCodeFrontendService } from './claude-code-frontend-service';
import { BashToolRenderer } from './renderers/bash-tool-renderer';
import { EditToolRenderer } from './renderers/edit-tool-renderer';
import { GlobToolRenderer } from './renderers/glob-tool-renderer';
import { GrepToolRenderer } from './renderers/grep-tool-renderer';
import { LSToolRenderer } from './renderers/ls-tool-renderer';
import { MultiEditToolRenderer } from './renderers/multiedit-tool-renderer';
import { ReadToolRenderer } from './renderers/read-tool-renderer';
import { TodoWriteRenderer } from './renderers/todo-write-renderer';
import { WebFetchToolRenderer } from './renderers/web-fetch-tool-renderer';
import { WriteToolRenderer } from './renderers/write-tool-renderer';
import { ClaudeCodeSlashCommandsContribution } from './claude-code-slash-commands-contribution';
import { ClaudeCodeCommandContribution } from './claude-code-command-contribution';

export default new ContainerModule(bind => {
    bind(PreferenceContribution).toConstantValue({ schema: ClaudeCodePreferencesSchema });
    bind(FrontendApplicationContribution).to(ClaudeCodeSlashCommandsContribution).inSingletonScope();
    bind(CommandContribution).to(ClaudeCodeCommandContribution).inSingletonScope();

    bind(ClaudeCodeFrontendService).toSelf().inSingletonScope();
    bind(ClaudeCodeClientImpl).toSelf().inSingletonScope();
    bind(ClaudeCodeClient).toService(ClaudeCodeClientImpl);
    bind(ClaudeCodeService).toDynamicValue(ctx => {
        const connection = ctx.container.get<ServiceConnectionProvider>(RemoteConnectionProvider);
        const backendClient: ClaudeCodeClient = ctx.container.get(ClaudeCodeClient);
        return connection.createProxy(CLAUDE_CODE_SERVICE_PATH, backendClient);
    }).inSingletonScope();

    bind(FileEditBackupServiceImpl).toSelf().inSingletonScope();
    bind(FileEditBackupService).toService(FileEditBackupServiceImpl);

    bind(ClaudeCodeEditToolServiceImpl).toSelf().inSingletonScope();
    bind(ClaudeCodeEditToolService).toService(ClaudeCodeEditToolServiceImpl);

    bind(ClaudeCodeChatAgent).toSelf().inSingletonScope();
    bind(Agent).toService(ClaudeCodeChatAgent);
    bind(ChatAgent).toService(ClaudeCodeChatAgent);

    bind(TodoWriteRenderer).toSelf().inSingletonScope();
    bind(ChatResponsePartRenderer).toService(TodoWriteRenderer);

    bind(ReadToolRenderer).toSelf().inSingletonScope();
    bind(ChatResponsePartRenderer).toService(ReadToolRenderer);

    bind(BashToolRenderer).toSelf().inSingletonScope();
    bind(ChatResponsePartRenderer).toService(BashToolRenderer);

    bind(LSToolRenderer).toSelf().inSingletonScope();
    bind(ChatResponsePartRenderer).toService(LSToolRenderer);

    bind(EditToolRenderer).toSelf().inSingletonScope();
    bind(ChatResponsePartRenderer).toService(EditToolRenderer);

    bind(GrepToolRenderer).toSelf().inSingletonScope();
    bind(ChatResponsePartRenderer).toService(GrepToolRenderer);

    bind(GlobToolRenderer).toSelf().inSingletonScope();
    bind(ChatResponsePartRenderer).toService(GlobToolRenderer);

    bind(WriteToolRenderer).toSelf().inSingletonScope();
    bind(ChatResponsePartRenderer).toService(WriteToolRenderer);

    bind(MultiEditToolRenderer).toSelf().inSingletonScope();
    bind(ChatResponsePartRenderer).toService(MultiEditToolRenderer);

    bind(WebFetchToolRenderer).toSelf().inSingletonScope();
    bind(ChatResponsePartRenderer).toService(WebFetchToolRenderer);
});
