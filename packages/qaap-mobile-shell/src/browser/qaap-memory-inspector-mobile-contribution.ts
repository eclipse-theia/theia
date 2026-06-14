// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import { ApplicationShell } from '@theia/core/lib/browser/shell/application-shell';
import { ShellLayoutTransformer } from '@theia/core/lib/browser/shell/shell-layout-restorer';
import { DebugFrontendContribution } from '@theia/memory-inspector/lib/browser/memory-inspector-frontend-contribution';
import { MemoryLayoutWidget } from '@theia/memory-inspector/lib/browser/wrapper-widgets/memory-layout-widget';
import { isQaapNarrowMobileWorkbench, stripRightPanelWidgetsOnMobile } from './qaap-mobile-layout-utils';

@injectable()
export class QaapMemoryInspectorMobileContribution extends DebugFrontendContribution implements ShellLayoutTransformer {

    transformLayoutOnRestore(layoutData: ApplicationShell.LayoutData): void {
        stripRightPanelWidgetsOnMobile(layoutData, [MemoryLayoutWidget.ID]);
    }

    override async initializeLayout(): Promise<void> {
        if (isQaapNarrowMobileWorkbench()) {
            return;
        }
        await super.initializeLayout();
    }
}
