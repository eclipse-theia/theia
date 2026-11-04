// *****************************************************************************
// Copyright (C) 2024 EclipseSource and others.
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

import '@theia/core/shared/reflect-metadata';
import { ContainerModule } from '@theia/core/shared/inversify';
import { RPCProtocol, RPCProtocolImpl } from '../../common/rpc-protocol.js';
import { AbstractPluginHostRPC, PluginHostRPC, PluginContainerModuleLoader } from './plugin-host-rpc.js';
import { AbstractPluginManagerExtImpl, MinimalTerminalServiceExt, PluginManagerExtImpl } from '../../plugin/plugin-manager.js';
import { IPCChannel } from '@theia/core/lib/node';
import { InternalPluginContainerModule } from '../../plugin/node/plugin-container-module.js';
import { LocalizationExt } from '../../common/plugin-api-rpc.js';
import { EnvExtImpl } from '../../plugin/env.js';
import { EnvNodeExtImpl } from '../../plugin/node/env-node-ext.js';
import { LocalizationExtImpl } from '../../plugin/localization-ext.js';
import { PreferenceRegistryExtImpl } from '../../plugin/preference-registry.js';
import { DebugExtImpl } from '../../plugin/debug/debug-ext.js';
import { EditorsAndDocumentsExtImpl } from '../../plugin/editors-and-documents.js';
import { WorkspaceExtImpl } from '../../plugin/workspace.js';
import { MessageRegistryExt } from '../../plugin/message-registry.js';
import { ClipboardExt } from '../../plugin/clipboard-ext.js';
import { KeyValueStorageProxy, InternalStorageExt } from '../../plugin/plugin-storage.js';
import { WebviewsExtImpl } from '../../plugin/webviews.js';
import { TerminalServiceExtImpl } from '../../plugin/terminal-ext.js';
import { InternalSecretsExt, SecretsExtImpl } from '../../plugin/secrets-ext.js';
import { setupPluginHostLogger } from './plugin-host-logger.js';
import { LmExtImpl } from '../../plugin/lm-ext.js';
import { LanguageModelToolsExtImpl } from '../../plugin/lm-tool-ext.js';
import { EncodingService } from '@theia/core/lib/common/encoding-service';
import { TelemetryExtImpl } from '../../plugin/telemetry-ext.js';

export default new ContainerModule(bind => {
    const channel = new IPCChannel();
    const rpc = new RPCProtocolImpl(channel);
    setupPluginHostLogger(rpc);
    bind(RPCProtocol).toConstantValue(rpc);

    bind(PluginContainerModuleLoader).toDynamicValue(({ container }) =>
        (module: ContainerModule) => {
            container.load(module);
            const internalModule = module as InternalPluginContainerModule;
            const pluginApiCache = internalModule.initializeApi?.(container);
            return pluginApiCache;
        }).inSingletonScope();

    bind(AbstractPluginHostRPC).toService(PluginHostRPC);
    bind(AbstractPluginManagerExtImpl).toService(PluginManagerExtImpl);
    bind(PluginManagerExtImpl).toSelf().inSingletonScope();
    bind(PluginHostRPC).toSelf().inSingletonScope();
    bind(EnvExtImpl).to(EnvNodeExtImpl).inSingletonScope();
    bind(LocalizationExt).to(LocalizationExtImpl).inSingletonScope();
    bind(InternalStorageExt).toService(KeyValueStorageProxy);
    bind(KeyValueStorageProxy).toSelf().inSingletonScope();
    bind(InternalSecretsExt).toService(SecretsExtImpl);
    bind(SecretsExtImpl).toSelf().inSingletonScope();
    bind(PreferenceRegistryExtImpl).toSelf().inSingletonScope();
    bind(DebugExtImpl).toSelf().inSingletonScope();
    bind(LmExtImpl).toSelf().inSingletonScope();
    bind(LanguageModelToolsExtImpl).toSelf().inSingletonScope();
    bind(EncodingService).toSelf().inSingletonScope();
    bind(EditorsAndDocumentsExtImpl).toSelf().inSingletonScope();
    bind(WorkspaceExtImpl).toSelf().inSingletonScope();
    bind(MessageRegistryExt).toSelf().inSingletonScope();
    bind(ClipboardExt).toSelf().inSingletonScope();
    bind(WebviewsExtImpl).toSelf().inSingletonScope();
    bind(MinimalTerminalServiceExt).toService(TerminalServiceExtImpl);
    bind(TerminalServiceExtImpl).toSelf().inSingletonScope();
    bind(TelemetryExtImpl).toSelf().inSingletonScope();
});
