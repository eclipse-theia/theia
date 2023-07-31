// *****************************************************************************
// Copyright (C) 2023 STMicroelectronics and others.
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

import { ElectronMainContext, RpcServerProvider } from '@theia/core';
import { ContainerModule } from '@theia/core/shared/inversify';
import { ElectronFileDialog } from '../electron-common';
import { ElectronFileDialogServer } from './electron-file-dialog-server';

export default new ContainerModule(bind => {
    bind(ElectronFileDialogServer).toSelf().inSingletonScope();
    bind(RpcServerProvider)
        .toDynamicValue(ctx => path => path === ElectronFileDialog && ctx.container.get(ElectronFileDialogServer))
        .inSingletonScope()
        .whenTargetNamed(ElectronMainContext);
});
