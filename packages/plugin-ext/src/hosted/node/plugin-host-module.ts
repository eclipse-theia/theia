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
import { RPCProtocol, RPCProtocolImpl } from '../../common/rpc-protocol';
import { AbstractPluginHostRPC, PluginHostRPC, PluginContainerModuleLoader } from './plugin-host-rpc';
import { AbstractPluginManagerExtImpl, MinimalTerminalServiceExt, PluginManagerExtImpl } from '../../plugin/plugin-manager';
import { IPCChannel } from '@theia/core/lib/node';
import { InternalPluginContainerModule } from '../../plugin/node/plugin-container-module';
import { LocalizationExt } from '../../common/plugin-api-rpc';
import { EnvExtImpl } from '../../plugin/env';
import { EnvNodeExtImpl } from '../../plugin/node/env-node-ext';
import { LocalizationExtImpl } from '../../plugin/localization-ext';
import { PreferenceRegistryExtImpl } from '../../plugin/preference-registry';
import { DebugExtImpl } from '../../plugin/debug/debug-ext';
import { EditorsAndDocumentsExtImpl } from '../../plugin/editors-and-documents';
import { WorkspaceExtImpl } from '../../plugin/workspace';
import { MessageRegistryExt } from '../../plugin/message-registry';
import { ClipboardExt } from '../../plugin/clipboard-ext';
import { KeyValueStorageProxy, InternalStorageExt } from '../../plugin/plugin-storage';
import { WebviewsExtImpl } from '../../plugin/webviews';
import { TerminalServiceExtImpl } from '../../plugin/terminal-ext';
import { InternalSecretsExt, SecretsExtImpl } from '../../plugin/secrets-ext';
import { setupPluginHostLogger } from './plugin-host-logger';
import { LmExtImpl } from '../../plugin/lm-ext';
import { EncodingService } from '@theia/core/lib/common/encoding-service';

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
    bind(EncodingService).toSelf().inSingletonScope();
    bind(EditorsAndDocumentsExtImpl).toSelf().inSingletonScope();
    bind(WorkspaceExtImpl).toSelf().inSingletonScope();
    bind(MessageRegistryExt).toSelf().inSingletonScope();
    bind(ClipboardExt).toSelf().inSingletonScope();
    bind(WebviewsExtImpl).toSelf().inSingletonScope();
    bind(MinimalTerminalServiceExt).toService(TerminalServiceExtImpl);
    bind(TerminalServiceExtImpl).toSelf().inSingletonScope();
});
