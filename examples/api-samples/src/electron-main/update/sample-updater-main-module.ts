// *****************************************************************************
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

import { ContainerModule } from '@theia/core/shared/inversify';
import { ElectronMainApplicationContribution } from '@theia/core/lib/electron-main/electron-main-application';
import { SampleUpdater } from '../../common/updater/sample-updater';
import { SampleUpdaterImpl } from './sample-updater-impl';
import { ElectronMainContext, RpcServerProvider } from '@theia/core';

export default new ContainerModule(bind => {
    bind(SampleUpdaterImpl).toSelf().inSingletonScope();
    bind(RpcServerProvider)
        .toDynamicValue(ctx => path => path === SampleUpdater && ctx.container.get(SampleUpdaterImpl))
        .inSingletonScope()
        .whenTargetNamed(ElectronMainContext);
    bind(SampleUpdater).toService(SampleUpdaterImpl);
    bind(ElectronMainApplicationContribution).toService(SampleUpdater);
    // TODO: BIND RPC HANDLER FOR SAMPLE UPDATER
});
