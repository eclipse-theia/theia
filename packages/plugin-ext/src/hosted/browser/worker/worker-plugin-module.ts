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
// eslint-disable-next-line import/no-extraneous-dependencies
import 'reflect-metadata';
import { ContainerModule } from '@theia/core/shared/inversify';
import { BasicChannel } from '@theia/core/lib/common/message-rpc/channel';
import { Uint8ArrayReadBuffer, Uint8ArrayWriteBuffer } from '@theia/core/lib/common/message-rpc/uint8-array-message-buffer';
import { LocalizationExt } from '../../../common/plugin-api-rpc';
import { RPCProtocol, RPCProtocolImpl } from '../../../common/rpc-protocol';
import { ClipboardExt } from '../../../plugin/clipboard-ext';
import { EditorsAndDocumentsExtImpl } from '../../../plugin/editors-and-documents';
import { MessageRegistryExt } from '../../../plugin/message-registry';
import { PluginManagerExtImpl } from '../../../plugin/plugin-manager';
import { KeyValueStorageProxy } from '../../../plugin/plugin-storage';
import { PreferenceRegistryExtImpl } from '../../../plugin/preference-registry';
import { SecretsExtImpl } from '../../../plugin/secrets-ext';
import { TerminalServiceExtImpl } from '../../../plugin/terminal-ext';
import { WebviewsExtImpl } from '../../../plugin/webviews';
import { WorkspaceExtImpl } from '../../../plugin/workspace';
import { createDebugExtStub } from './debug-stub';
import { EnvExtImpl } from '../../../plugin/env';
import { WorkerEnvExtImpl } from './worker-env-ext';
import { DebugExtImpl } from '../../../plugin/debug/debug-ext';
import { LocalizationExtImpl } from '../../../plugin/localization-ext';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ctx = self as any;

export default new ContainerModule(bind => {
    const channel = new BasicChannel(() => {
        const writeBuffer = new Uint8ArrayWriteBuffer();
        writeBuffer.onCommit(buffer => {
            ctx.postMessage(buffer);
        });
        return writeBuffer;
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    addEventListener('message', (message: any) => {
        channel.onMessageEmitter.fire(() => new Uint8ArrayReadBuffer(message.data));
    });

    const rpc = new RPCProtocolImpl(channel);

    bind(RPCProtocol).toConstantValue(rpc);

    bind(PluginManagerExtImpl).toSelf().inSingletonScope();
    bind(EnvExtImpl).to(WorkerEnvExtImpl).inSingletonScope();
    bind(LocalizationExt).to(LocalizationExtImpl).inSingletonScope();
    bind(KeyValueStorageProxy).toSelf().inSingletonScope();
    bind(SecretsExtImpl).toSelf().inSingletonScope();
    bind(PreferenceRegistryExtImpl).toSelf().inSingletonScope();
    bind(DebugExtImpl).toDynamicValue(({ container }) => createDebugExtStub(container))
        .inSingletonScope();
    bind(EditorsAndDocumentsExtImpl).toSelf().inSingletonScope();
    bind(WorkspaceExtImpl).toSelf().inSingletonScope();
    bind(MessageRegistryExt).toSelf().inSingletonScope();
    bind(ClipboardExt).toSelf().inSingletonScope();
    bind(WebviewsExtImpl).toSelf().inSingletonScope();
    bind(TerminalServiceExtImpl).toSelf().inSingletonScope();
});
