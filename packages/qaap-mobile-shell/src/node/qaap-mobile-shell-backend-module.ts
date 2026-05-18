// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ContainerModule } from '@theia/core/shared/inversify';
import { BackendApplicationContribution } from '@theia/core/lib/node';
import { QaapGithubOauthEndpoint } from './qaap-github-oauth-endpoint';
import { QaapGithubSessionStore } from './qaap-github-session-store';

export default new ContainerModule(bind => {
    bind(QaapGithubSessionStore).toSelf().inSingletonScope();
    bind(QaapGithubOauthEndpoint).toSelf().inSingletonScope();
    bind(BackendApplicationContribution).toService(QaapGithubOauthEndpoint);
});
