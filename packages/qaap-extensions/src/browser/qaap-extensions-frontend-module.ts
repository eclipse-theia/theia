// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import '../../src/browser/style/qaap-login.css';

import { ContainerModule } from '@theia/core/shared/inversify';
import { CommandContribution } from '@theia/core/lib/common/command';
import { PreferenceContribution } from '@theia/core/lib/common/preferences';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { QaapAiPreferenceBrandingContribution, QaapAiPreferenceBrandingStartup } from './qaap-ai-preference-branding-contribution';
import { QaapHubActionsContribution } from './qaap-hub-actions-contribution';
import { QaapHubChatSyncContribution } from './qaap-hub-chat-sync-contribution';
import { QaapMobileAppTesterContribution } from './qaap-mobile-app-tester-contribution';
import { QaapMissionUndoContribution } from './qaap-mission-undo-contribution';
import { QaapPushNotificationContribution } from './qaap-push-notification-contribution';
import { QaapAgentCompletionContribution } from './qaap-agent-completion-contribution';

export default new ContainerModule(bind => {
    bind(QaapAgentCompletionContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(QaapAgentCompletionContribution);

    bind(QaapAiPreferenceBrandingContribution).toSelf().inSingletonScope();
    bind(PreferenceContribution).toService(QaapAiPreferenceBrandingContribution);
    bind(QaapAiPreferenceBrandingStartup).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(QaapAiPreferenceBrandingStartup);

    bind(QaapHubActionsContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(QaapHubActionsContribution);
    bind(FrontendApplicationContribution).toService(QaapHubActionsContribution);

    bind(QaapMobileAppTesterContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(QaapMobileAppTesterContribution);

    bind(QaapMissionUndoContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(QaapMissionUndoContribution);

    bind(QaapHubChatSyncContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(QaapHubChatSyncContribution);

    bind(QaapPushNotificationContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(QaapPushNotificationContribution);
});
