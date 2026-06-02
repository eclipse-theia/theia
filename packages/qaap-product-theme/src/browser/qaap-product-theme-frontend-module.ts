// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import '../../src/browser/style/workbench-cursor-typography.css';
import '../../src/browser/style/qaap-tokens.css';
import '../../src/browser/style/qaap-conservador-dna.css';
import '../../src/browser/style/qaap-workbench-top-bar.css';
import '../../src/browser/style/qaap-ai-chat-mobile.css';
import '../../src/browser/style/qaap-chat-scroll-edges.css';
import '../../src/browser/style/qaap-vsx-registry.css';
import '../../src/browser/style/qaap-menus-narrow-viewport.css';
import '../../src/browser/style/qaap-sidepanel.css';
import '../../src/browser/style/qaap-sidepanel-narrow-viewport.css';
import '../../src/browser/style/qaap-dialog-narrow-viewport.css';
import '../../src/browser/style/qaap-tabbar-narrow-viewport.css';
import '../../src/browser/style/qaap-mini-browser-toolbar-mobile.css';
import '../../src/browser/style/qaap-terminal-mobile.css';
import '../../src/browser/style/qaap-monaco-quick-input-narrow.css';
import '../../src/browser/style/qaap-select-component-narrow.css';
import '../../src/browser/style/qaap-status-bar.css';
import '../../src/browser/style/qaap-workbench-chrome.css';
import '../../src/browser/style/qaap-file-dialog.css';
import '../../src/browser/style/qaap-notifications.css';
import '../../src/browser/style/qaap-getting-started.css';

import { ContainerModule } from '@theia/core/shared/inversify';
import { ColorContribution } from '@theia/core/lib/browser/color-application-contribution';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { QaapWorkbenchColorContribution } from './qaap-workbench-color-contribution';
import { QaapThemeContribution } from './qaap-theme-contribution';

export default new ContainerModule(bind => {
    bind(QaapWorkbenchColorContribution).toSelf().inSingletonScope();
    bind(ColorContribution).toService(QaapWorkbenchColorContribution);

    bind(QaapThemeContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(QaapThemeContribution);
});
