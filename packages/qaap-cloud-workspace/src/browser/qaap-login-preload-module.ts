// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import '../../src/browser/style/qaap-login.css';

import { ContainerModule } from '@theia/core/shared/inversify';
import { PreloadContribution } from '@theia/core/lib/browser/preload/preloader';
import { QaapLoginPreloadContribution } from './qaap-login-preload-contribution';

export default new ContainerModule(bind => {
    bind(QaapLoginPreloadContribution).toSelf().inSingletonScope();
    bind(PreloadContribution).toService(QaapLoginPreloadContribution);
});
