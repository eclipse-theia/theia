// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ContainerModule } from '@theia/core/shared/inversify';
import { LocalizationContribution } from '@theia/core/lib/node/i18n/localization-contribution';
import { QaapLocalizationContribution } from './qaap-localization-contribution';

export default new ContainerModule(bind => {
    bind(QaapLocalizationContribution).toSelf().inSingletonScope();
    bind(LocalizationContribution).toService(QaapLocalizationContribution);
});
