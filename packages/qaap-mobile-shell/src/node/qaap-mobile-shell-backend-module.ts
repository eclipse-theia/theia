// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ContainerModule } from '@theia/core/shared/inversify';
import { BackendApplicationContribution } from '@theia/core/lib/node';
import { QaapDevPreviewEndpoint } from './qaap-dev-preview-endpoint';
import { QaapGitReviewEndpoint } from './qaap-git-review-endpoint';
import { QaapGithubInboxEndpoint } from './qaap-github-inbox-endpoint';
import { QaapGithubInboxHub } from './qaap-github-inbox-hub';
import { QaapGithubOauthEndpoint } from './qaap-github-oauth-endpoint';
import { QaapGithubSessionStore } from './qaap-github-session-store';
import { QaapProjectSessionStore } from './qaap-project-session-store';

export default new ContainerModule(bind => {
    bind(QaapGithubSessionStore).toSelf().inSingletonScope();
    bind(QaapGithubInboxHub).toSelf().inSingletonScope();
    bind(QaapGithubInboxEndpoint).toSelf().inSingletonScope();
    bind(BackendApplicationContribution).toService(QaapGithubInboxEndpoint);
    bind(QaapProjectSessionStore).toSelf().inSingletonScope();
    bind(QaapGithubOauthEndpoint).toSelf().inSingletonScope();
    bind(BackendApplicationContribution).toService(QaapGithubOauthEndpoint);
    bind(QaapDevPreviewEndpoint).toSelf().inSingletonScope();
    bind(BackendApplicationContribution).toService(QaapDevPreviewEndpoint);
    bind(QaapGitReviewEndpoint).toSelf().inSingletonScope();
    bind(BackendApplicationContribution).toService(QaapGitReviewEndpoint);
});
