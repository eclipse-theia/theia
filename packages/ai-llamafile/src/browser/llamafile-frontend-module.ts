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
import { CommandContribution } from '@theia/core';
import { FrontendApplicationContribution, RemoteConnectionProvider, ServiceConnectionProvider } from '@theia/core/lib/browser';
import { ContainerModule } from '@theia/core/shared/inversify';
import { OutputChannelManager, OutputChannelSeverity } from '@theia/output/lib/browser/output-channel';
import { LlamafileManager, LlamafileManagerPath, LlamafileServerManagerClient } from '../common/llamafile-manager';
import { LlamafileCommandContribution } from './llamafile-command-contribution';
import { LlamafileFrontendApplicationContribution } from './llamafile-frontend-application-contribution';
import { bindAILlamafilePreferences } from './llamafile-preferences';

export default new ContainerModule(bind => {
    bind(FrontendApplicationContribution).to(LlamafileFrontendApplicationContribution).inSingletonScope();
    bind(CommandContribution).to(LlamafileCommandContribution).inSingletonScope();
    bind(LlamafileManager).toDynamicValue(ctx => {
        const connection = ctx.container.get<ServiceConnectionProvider>(RemoteConnectionProvider);
        const outputChannelManager = ctx.container.get(OutputChannelManager);
        const client: LlamafileServerManagerClient = {
            error: (llamafileName, message) => {
                const channel = outputChannelManager.getChannel(`${llamafileName}-llamafile`);
                channel.appendLine(message, OutputChannelSeverity.Error);
            },
            log: (llamafileName, message) => {
                const channel = outputChannelManager.getChannel(`${llamafileName}-llamafile`);
                channel.appendLine(message, OutputChannelSeverity.Info);
            }
        };
        return connection.createProxy<LlamafileManager>(LlamafileManagerPath, client);
    }).inSingletonScope();

    bindAILlamafilePreferences(bind);
});
