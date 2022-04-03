// *****************************************************************************
// Copyright (C) 2022 Ericsson// *****************************************************************************
// Copyright (C) 2020 TypeFox and others.
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

import { ServiceContribution } from '@theia/core/lib/common';
import { ElectronMainAndBackend } from '@theia/core/lib/electron-common';
import { ContainerModule } from '@theia/core/shared/inversify';
import { ElectronMainAndBackendIpcSample, ELECTRON_MAIN_AND_BACKEND_IPC_SAMPLE_PATH } from '../../electron-common/ipc/electron-ipc';
import { ElectronMainAndBackendIpcSampleImpl } from './electron-main-ipc-impl';

export default new ContainerModule(bind => {
    bind(ElectronMainAndBackendIpcSample).to(ElectronMainAndBackendIpcSampleImpl).inSingletonScope();
    bind(ServiceContribution)
        .toDynamicValue(ctx => ({
            [ELECTRON_MAIN_AND_BACKEND_IPC_SAMPLE_PATH]: () => ctx.container.get(ElectronMainAndBackendIpcSample)
        }))
        .inSingletonScope()
        .whenTargetNamed(ElectronMainAndBackend);
});
