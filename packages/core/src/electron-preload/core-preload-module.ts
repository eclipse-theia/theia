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
import { TheiaIpcWindowImpl } from '../electron-browser/electron-ipc-window-impl';
import * as common from '../electron-common';
import { TheiaContextBridgeImpl } from './electron-context-bridge-impl';
import { TheiaIpcRendererImpl } from './electron-ipc-renderer-impl';
import { ElectronPreloadRpcSync } from './electron-rpc-sync-preload';

export default new ContainerModule(bind => {
    bind(common.FunctionUtils).toSelf().inSingletonScope();
    bind(common.TheiaIpcWindow).to(TheiaIpcWindowImpl).inSingletonScope();
    bind(common.TheiaIpcRenderer).to(TheiaIpcRendererImpl).inSingletonScope();
    bind(common.TheiaContextBridge).to(TheiaContextBridgeImpl).inSingletonScope();
    bind(ElectronPreloadRpcSync).toSelf().inSingletonScope();
    bind(common.ElectronPreloadContribution).toService(ElectronPreloadRpcSync);
});
