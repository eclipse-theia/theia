// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import '../../src/browser/style/mobile-workbench.css';

import { ContainerModule } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { CommandContribution } from '@theia/core/lib/common/command';
import { MonacoQuickInputLayout } from '@theia/monaco/lib/browser/monaco-quick-input-layout';
import { MiniBrowserOpenHook } from '@theia/mini-browser/lib/browser/mini-browser-open-hook';
import { MobileOneColumnShellContribution } from './mobile-one-column-shell-contribution';
import { MobileOnboardingTutorialContribution } from './mobile-onboarding-tutorial-contribution';
import { MobileThemeChromeContribution } from './mobile-theme-chrome-contribution';
import { MobileEditorGestureContribution } from './mobile-editor-gesture-contribution';
import { QaapMonacoQuickInputLayout } from './qaap-monaco-quick-input-layout';
import { QaapMiniBrowserOpenHook } from './qaap-mini-browser-open-hook';

export default new ContainerModule((bind, _unbind, _isBound, rebind) => {
    bind(MobileOneColumnShellContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(MobileOneColumnShellContribution);
    bind(MobileOnboardingTutorialContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(MobileOnboardingTutorialContribution);
    bind(CommandContribution).toService(MobileOnboardingTutorialContribution);
    bind(MobileThemeChromeContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(MobileThemeChromeContribution);
    bind(MobileEditorGestureContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(MobileEditorGestureContribution);

    rebind(MonacoQuickInputLayout).to(QaapMonacoQuickInputLayout).inSingletonScope();
    rebind(MiniBrowserOpenHook).to(QaapMiniBrowserOpenHook).inSingletonScope();
});
