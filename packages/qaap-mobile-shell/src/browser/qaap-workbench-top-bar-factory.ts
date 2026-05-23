// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import { CommandRegistry } from '@theia/core/lib/common';
import { ApplicationShell, Widget } from '@theia/core/lib/browser';
import { WorkbenchTopBarFactory } from '@theia/core/lib/browser/menu/workbench-top-bar-factory';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { MobileProjectsService } from './mobile-projects-service';
import {
    QaapWorkbenchHistoryNavWidget,
    QaapWorkbenchNavControlsWidget,
    QaapWorkbenchRightControlsWidget,
} from './qaap-workbench-top-bar-widgets';

@injectable()
export class QaapWorkbenchTopBarFactory implements WorkbenchTopBarFactory {

    @inject(MobileProjectsService)
    protected readonly projectsService: MobileProjectsService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    createLeadingTopBarWidget(commands: CommandRegistry): Widget {
        return new QaapWorkbenchNavControlsWidget(commands, this.projectsService, this.workspaceService);
    }

    createTrailingTopBarWidgets(commands: CommandRegistry, shell: ApplicationShell): Widget[] {
        return [
            new QaapWorkbenchHistoryNavWidget(commands, this.workspaceService),
            new QaapWorkbenchRightControlsWidget(commands, shell),
        ];
    }
}
