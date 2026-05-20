// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import '../../src/browser/style/mobile-workbench.css';
import '../../src/browser/style/qaap-mobile-touch-scroll.css';
import '../../src/browser/style/qaap-empty-workbench-brand.css';
import '../../src/browser/style/qaap-project-bootstrap.css';

import { bindToolProvider } from '@theia/ai-core/lib/common';
import { ContainerModule } from '@theia/core/shared/inversify';
import {
    QaapBootstrapOpenPreviewTool,
    QaapBootstrapRunDevTool,
    QaapBootstrapStatusTool,
} from './qaap-bootstrap-tool-providers';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { CommandContribution } from '@theia/core/lib/common/command';
import { KeybindingContribution } from '@theia/core/lib/browser/keybinding';
import { ShellLayoutTransformer } from '@theia/core/lib/browser/shell/shell-layout-restorer';
import { MobileOneColumnShellContribution } from './mobile-one-column-shell-contribution';
import { QaapShellLayoutRestoreContribution } from './qaap-shell-layout-restore-contribution';
import { MobileOnboardingTutorialContribution } from './mobile-onboarding-tutorial-contribution';
import { MobileThemeChromeContribution } from './mobile-theme-chrome-contribution';
import { MobileEditorGestureContribution } from './mobile-editor-gesture-contribution';
import { QaapEmptyWorkbenchBrandingContribution } from './qaap-empty-workbench-branding-contribution';
import { QaapWatermarkCommandsContribution } from './qaap-watermark-commands-contribution';
import { LongPressContextMenuContribution } from './long-press-context-menu';
import { MobileProjectsService } from './mobile-projects-service';
import { MobileProjectsReadmeContribution } from './mobile-projects-readme-contribution';
import { QaapProjectBootstrapDetector } from './qaap-project-bootstrap-detector';
import { QaapProjectBootstrapService } from './qaap-project-bootstrap-service';
import { QaapProjectBootstrapContribution } from './qaap-project-bootstrap-contribution';
import { MobileTouchScrollContribution } from './mobile-touch-scroll-contribution';

export default new ContainerModule(bind => {
    bind(MobileProjectsService).toSelf().inSingletonScope();
    bind(MobileProjectsReadmeContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(MobileProjectsReadmeContribution);
    bind(MobileOneColumnShellContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(MobileOneColumnShellContribution);
    bind(QaapShellLayoutRestoreContribution).toSelf().inSingletonScope();
    bind(ShellLayoutTransformer).toService(QaapShellLayoutRestoreContribution);
    bind(MobileOnboardingTutorialContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(MobileOnboardingTutorialContribution);
    bind(CommandContribution).toService(MobileOnboardingTutorialContribution);
    bind(MobileThemeChromeContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(MobileThemeChromeContribution);
    bind(MobileEditorGestureContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(MobileEditorGestureContribution);

    bind(QaapWatermarkCommandsContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(QaapWatermarkCommandsContribution);
    bind(KeybindingContribution).toService(QaapWatermarkCommandsContribution);

    bind(QaapEmptyWorkbenchBrandingContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(QaapEmptyWorkbenchBrandingContribution);

    bind(LongPressContextMenuContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(LongPressContextMenuContribution);

    bind(QaapProjectBootstrapDetector).toSelf().inSingletonScope();
    bind(QaapProjectBootstrapService).toSelf().inSingletonScope();
    bind(MobileTouchScrollContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(MobileTouchScrollContribution);

    bind(QaapProjectBootstrapContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(QaapProjectBootstrapContribution);

    bindToolProvider(QaapBootstrapStatusTool, bind);
    bindToolProvider(QaapBootstrapRunDevTool, bind);
    bindToolProvider(QaapBootstrapOpenPreviewTool, bind);
});
