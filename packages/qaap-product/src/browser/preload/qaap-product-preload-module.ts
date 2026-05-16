// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ContainerModule } from '@theia/core/shared/inversify';
import { TextReplacementContribution } from '@theia/core/lib/browser/preload/text-replacement-contribution';
import { QaapTextReplacementContribution } from './qaap-text-replacement-contribution';

export default new ContainerModule(bind => {
    bind(QaapTextReplacementContribution).toSelf().inSingletonScope();
    bind(TextReplacementContribution).toService(QaapTextReplacementContribution);
});
