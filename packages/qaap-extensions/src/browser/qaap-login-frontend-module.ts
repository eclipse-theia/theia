// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import '../../src/browser/style/qaap-login.css';

import { ContainerModule } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { QaapLoginContribution } from './qaap-login-contribution';

export default new ContainerModule(bind => {
    bind(QaapLoginContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(QaapLoginContribution);
});
