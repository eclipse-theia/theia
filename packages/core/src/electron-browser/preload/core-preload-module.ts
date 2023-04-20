// *****************************************************************************
// Copyright (C) 2023 Ericsson and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { ContainerModule } from 'inversify';
import * as common from '../../electron-common';
import { TheiaIpcWindowImpl } from '../electron-ipc-window-impl';
import { ElectronClipboardServiceImpl } from './electron-clipboard-impl';
import { TheiaContextBridgeImpl } from './electron-context-bridge-impl';
import { ElectronCurrentWindowImpl } from './electron-current-window-impl';
import { ElectronFrontendApplicationImpl } from './electron-frontend-application-impl';
import { ElectronIpcHandleConverterImpl } from './electron-ipc-handle-converter-impl';
import { TheiaIpcRendererImpl } from './electron-ipc-renderer-impl';
import { ElectronKeyboardLayoutImpl } from './electron-keyboard-layout';
import { ElectronMessagePortBroker } from './electron-message-port-broker';
import { TheiaPreloadContextImpl } from './electron-preload-context-impl';
import { ElectronShellImpl } from './electron-shell-impl';
import { ElectronSecurityTokenServiceImpl } from './electron-token-impl';
import { ElectronWindowsImpl } from './electron-windows-impl';

export default new ContainerModule(bind => {
    bind(common.FunctionUtils).toSelf().inSingletonScope();
    bind(common.TheiaPreloadContext).toDynamicValue(ctx => new TheiaPreloadContextImpl(ctx.container)).inSingletonScope();
    bind(common.TheiaIpcWindow).to(TheiaIpcWindowImpl).inSingletonScope();
    bind(common.TheiaIpcRenderer).to(TheiaIpcRendererImpl).inSingletonScope();
    bind(common.TheiaContextBridge).to(TheiaContextBridgeImpl).inSingletonScope();
    bind(common.IpcHandleConverter).to(ElectronIpcHandleConverterImpl).inSingletonScope();
    bind(common.ElectronPreloadContribution).to(ElectronMessagePortBroker).inSingletonScope();
    const { bindPreloadApi } = common;
    bindPreloadApi(bind, common.ElectronClipboardService).to(ElectronClipboardServiceImpl).inSingletonScope();
    bindPreloadApi(bind, common.ElectronCurrentWindow).to(ElectronCurrentWindowImpl).inSingletonScope();
    bindPreloadApi(bind, common.ElectronFrontendApplication).to(ElectronFrontendApplicationImpl).inSingletonScope();
    bindPreloadApi(bind, common.ElectronKeyboardLayout).to(ElectronKeyboardLayoutImpl).inSingletonScope();
    bindPreloadApi(bind, common.ElectronSecurityTokenService).to(ElectronSecurityTokenServiceImpl).inSingletonScope();
    bindPreloadApi(bind, common.ElectronShell).to(ElectronShellImpl).inSingletonScope();
    bindPreloadApi(bind, common.ElectronWindows).to(ElectronWindowsImpl).inSingletonScope();
});
