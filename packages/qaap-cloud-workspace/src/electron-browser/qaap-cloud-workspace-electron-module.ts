// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ContainerModule } from '@theia/core/shared/inversify';
import { CommandContribution } from '@theia/core/lib/common/command';
import { QaapCloudDevcontainerContribution } from './qaap-cloud-devcontainer-contribution';

export default new ContainerModule(bind => {
    bind(QaapCloudDevcontainerContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(QaapCloudDevcontainerContribution);
});
