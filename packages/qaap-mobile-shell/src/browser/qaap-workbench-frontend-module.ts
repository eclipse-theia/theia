// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import '../../src/browser/style/qaap-workbench-account-menu.css';

import { ContainerModule } from '@theia/core/shared/inversify';
import { CommandContribution } from '@theia/core/lib/common/command';
import { WorkbenchTopBarFactory } from '@theia/core/lib/browser/menu/workbench-top-bar-factory';
import { QaapAuthCommandContribution } from './qaap-auth-command-contribution';
import { QaapWorkbenchTopBarFactory } from './qaap-workbench-top-bar-factory';

/** Rebinds {@link WorkbenchTopBarFactory} so the menu bar uses Qaap nav controls (same mount path as before). */
export default new ContainerModule((bind, _unbind, _isBound, rebind) => {
    bind(QaapAuthCommandContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(QaapAuthCommandContribution);
    rebind(WorkbenchTopBarFactory).to(QaapWorkbenchTopBarFactory).inSingletonScope();
});
