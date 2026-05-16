// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ContainerModule } from '@theia/core/shared/inversify';
import { ElectronMainApplication } from '@theia/core/lib/electron-main/electron-main-application';
import { QaapElectronMainApplication } from './qaap-electron-main-application';

export default new ContainerModule((_bind, _unbind, _isBound, rebind) => {
    rebind(ElectronMainApplication).to(QaapElectronMainApplication).inSingletonScope();
});
