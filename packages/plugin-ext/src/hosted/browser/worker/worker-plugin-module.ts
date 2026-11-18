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
import { LocalizationExt } from '../../../common/plugin-api-rpc.js';
import { RPCProtocol, RPCProtocolImpl } from '../../../common/rpc-protocol.js';
import { ClipboardExt } from '../../../plugin/clipboard-ext.js';
import { EditorsAndDocumentsExtImpl } from '../../../plugin/editors-and-documents.js';
import { MessageRegistryExt } from '../../../plugin/message-registry.js';
import { MinimalTerminalServiceExt, PluginManagerExtImpl } from '../../../plugin/plugin-manager.js';
import { InternalStorageExt, KeyValueStorageProxy } from '../../../plugin/plugin-storage.js';
import { PreferenceRegistryExtImpl } from '../../../plugin/preference-registry.js';
import { InternalSecretsExt, SecretsExtImpl } from '../../../plugin/secrets-ext.js';
import { TerminalServiceExtImpl } from '../../../plugin/terminal-ext.js';
import { WebviewsExtImpl } from '../../../plugin/webviews.js';
import { WorkspaceExtImpl } from '../../../plugin/workspace.js';
import { createDebugExtStub } from './debug-stub.js';
import { EnvExtImpl } from '../../../plugin/env.js';
import { WorkerEnvExtImpl } from './worker-env-ext.js';
import { DebugExtImpl } from '../../../plugin/debug/debug-ext.js';
import { LocalizationExtImpl } from '../../../plugin/localization-ext.js';
import { EncodingService } from '@theia/core/lib/common/encoding-service';
import { TelemetryExtImpl } from '../../../plugin/telemetry-ext.js';

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
    bind(LocalizationExtImpl).toSelf().inSingletonScope();
    bind(LocalizationExt).toService(LocalizationExtImpl);
    bind(KeyValueStorageProxy).toSelf().inSingletonScope();
    bind(InternalStorageExt).toService(KeyValueStorageProxy);
    bind(SecretsExtImpl).toSelf().inSingletonScope();
    bind(InternalSecretsExt).toService(SecretsExtImpl);
    bind(PreferenceRegistryExtImpl).toSelf().inSingletonScope();
    bind(DebugExtImpl).toDynamicValue(({ container }) => {
        const child = container.createChild();
        child.bind(DebugExtImpl).toSelf();
        return createDebugExtStub(child);
    }).inSingletonScope();
    bind(EncodingService).toSelf().inSingletonScope();
    bind(EditorsAndDocumentsExtImpl).toSelf().inSingletonScope();
    bind(WorkspaceExtImpl).toSelf().inSingletonScope();
    bind(MessageRegistryExt).toSelf().inSingletonScope();
    bind(ClipboardExt).toSelf().inSingletonScope();
    bind(WebviewsExtImpl).toSelf().inSingletonScope();
    bind(TerminalServiceExtImpl).toSelf().inSingletonScope();
    bind(MinimalTerminalServiceExt).toService(TerminalServiceExtImpl);
    bind(TelemetryExtImpl).toSelf().inSingletonScope();
});
