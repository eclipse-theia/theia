// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import { FrontendApplication } from '@theia/core/lib/browser';
import { ApplicationShell } from '@theia/core/lib/browser/shell/application-shell';
import { ShellLayoutTransformer } from '@theia/core/lib/browser/shell/shell-layout-restorer';
import { OutlineViewContribution, OUTLINE_WIDGET_FACTORY_ID } from '@theia/outline-view/lib/browser/outline-view-contribution';
import { isQaapNarrowMobileWorkbench, stripRightPanelWidgetsOnMobile } from './qaap-mobile-layout-utils';

@injectable()
export class QaapOutlineMobileContribution extends OutlineViewContribution implements ShellLayoutTransformer {

    transformLayoutOnRestore(layoutData: ApplicationShell.LayoutData): void {
        stripRightPanelWidgetsOnMobile(layoutData, [OUTLINE_WIDGET_FACTORY_ID]);
    }

    override async initializeLayout(app: FrontendApplication): Promise<void> {
        if (isQaapNarrowMobileWorkbench()) {
            return;
        }
        await super.initializeLayout(app);
    }
}
