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
import { RPCProtocol, RPCProtocolImpl } from '@theia/plugin-ext/lib/common/rpc-protocol';
import { AbstractPluginHostRPC, PluginContainerModuleLoader } from '@theia/plugin-ext/lib/hosted/node/plugin-host-rpc';
import { AbstractPluginManagerExtImpl, MinimalTerminalServiceExt } from '@theia/plugin-ext/lib/plugin/plugin-manager';
import { HeadlessPluginHostRPC } from './plugin-host-headless-rpc';
import { HeadlessPluginManagerExtImpl } from '../../plugin/headless-plugin-manager';
import { IPCChannel } from '@theia/core/lib/node';
import { InternalPluginContainerModule } from '@theia/plugin-ext/lib/plugin/node/plugin-container-module';

import { EnvExtImpl } from '@theia/plugin-ext/lib/plugin/env';
import { EnvNodeExtImpl } from '@theia/plugin-ext/lib/plugin/node/env-node-ext';
import { LocalizationExt } from '@theia/plugin-ext';
import { LocalizationExtImpl } from '@theia/plugin-ext/lib/plugin/localization-ext';
import { InternalStorageExt } from '@theia/plugin-ext/lib/plugin/plugin-storage';
import { InternalSecretsExt } from '@theia/plugin-ext/lib/plugin/secrets-ext';
import { EnvironmentVariableCollectionImpl } from '@theia/plugin-ext/lib/plugin/terminal-ext';
import { Disposable } from '@theia/core';

export default new ContainerModule(bind => {
    const channel = new IPCChannel();
    bind(RPCProtocol).toConstantValue(new RPCProtocolImpl(channel));

    bind(PluginContainerModuleLoader).toDynamicValue(({ container }) =>
        (module: ContainerModule) => {
            container.load(module);
            const internalModule = module as InternalPluginContainerModule;
            const pluginApiCache = internalModule.initializeApi?.(container);
            return pluginApiCache;
        }).inSingletonScope();

    bind(AbstractPluginHostRPC).toService(HeadlessPluginHostRPC);
    bind(HeadlessPluginHostRPC).toSelf().inSingletonScope();
    bind(AbstractPluginManagerExtImpl).toService(HeadlessPluginManagerExtImpl);
    bind(HeadlessPluginManagerExtImpl).toSelf().inSingletonScope();
    bind(EnvExtImpl).to(EnvNodeExtImpl).inSingletonScope();
    bind(LocalizationExt).to(LocalizationExtImpl).inSingletonScope();

    const dummySecrets: InternalSecretsExt = {
        get: () => Promise.resolve(undefined),
        store: () => Promise.resolve(undefined),
        delete: () => Promise.resolve(undefined),
        $onDidChangePassword: () => Promise.resolve(),
        onDidChangePassword: () => Disposable.NULL,
    };
    const dummyStorage: InternalStorageExt = {
        init: () => undefined,
        setPerPluginData: () => Promise.resolve(false),
        getPerPluginData: () => ({}),
        storageDataChangedEvent: () => Disposable.NULL,
        $updatePluginsWorkspaceData: () => undefined
    };
    const dummyTerminalService: MinimalTerminalServiceExt = {
        $initEnvironmentVariableCollections: () => undefined,
        $setShell: () => undefined,
        getEnvironmentVariableCollection: () => new EnvironmentVariableCollectionImpl(false),
    };
    bind(InternalSecretsExt).toConstantValue(dummySecrets);
    bind(InternalStorageExt).toConstantValue(dummyStorage);
    bind(MinimalTerminalServiceExt).toConstantValue(dummyTerminalService);
});
