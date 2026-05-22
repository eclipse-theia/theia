// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ContainerModule } from '@theia/core/shared/inversify';
import { BackendApplicationContribution } from '@theia/core/lib/node';
import { QaapDevPreviewEndpoint } from './qaap-dev-preview-endpoint';
import { QaapGitReviewEndpoint } from './qaap-git-review-endpoint';
import { QaapGithubOauthEndpoint } from './qaap-github-oauth-endpoint';
import { QaapGithubSessionStore } from './qaap-github-session-store';
import { QaapProjectSessionStore } from './qaap-project-session-store';
import { QaapTemplateScaffold } from './qaap-template-scaffold';

export default new ContainerModule(bind => {
    bind(QaapGithubSessionStore).toSelf().inSingletonScope();
    bind(QaapProjectSessionStore).toSelf().inSingletonScope();
    bind(QaapTemplateScaffold).toSelf().inSingletonScope();
    bind(QaapGithubOauthEndpoint).toSelf().inSingletonScope();
    bind(BackendApplicationContribution).toService(QaapGithubOauthEndpoint);
    bind(QaapDevPreviewEndpoint).toSelf().inSingletonScope();
    bind(BackendApplicationContribution).toService(QaapDevPreviewEndpoint);
    bind(QaapGitReviewEndpoint).toSelf().inSingletonScope();
    bind(BackendApplicationContribution).toService(QaapGitReviewEndpoint);
});
