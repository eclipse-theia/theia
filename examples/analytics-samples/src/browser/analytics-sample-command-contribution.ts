// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { AnalyticsService } from '@theia/analytics/lib/common';
import { Command, CommandContribution, CommandRegistry } from '@theia/core/lib/common';
import { inject, injectable } from '@theia/core/shared/inversify';

const ANALYTICS_SAMPLE_CATEGORY = 'Analytics Samples';

export const ReportAnalyticsStartedCommand: Command = {
    id: 'analytics-samples.report-started',
    label: 'Report Started Event',
    category: ANALYTICS_SAMPLE_CATEGORY
};

export const ReportAnalyticsCompletedCommand: Command = {
    id: 'analytics-samples.report-completed',
    label: 'Report Completed Event',
    category: ANALYTICS_SAMPLE_CATEGORY
};

export const ReportAnalyticsOtherCommand: Command = {
    id: 'analytics-samples.report-other',
    label: 'Report Other Event',
    category: ANALYTICS_SAMPLE_CATEGORY
};

interface StartedData {
    source: string;
    attempt: number;
    interactive: boolean;
}

interface CompletedData {
    source: string;
    duration: number;
    stages: readonly string[];
}

interface OtherData {
    source: string;
    kind: string;
}

@injectable()
export class AnalyticsSampleCommandContribution implements CommandContribution {

    @inject(AnalyticsService)
    protected readonly analyticsService: AnalyticsService;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(ReportAnalyticsStartedCommand, {
            execute: () => this.analyticsService.report<StartedData>('sample/analytics/started', {
                source: 'command',
                attempt: 1,
                interactive: true
            })
        });
        commands.registerCommand(ReportAnalyticsCompletedCommand, {
            execute: () => this.analyticsService.report<CompletedData>('sample/analytics/completed', {
                source: 'command',
                duration: 125,
                stages: ['prepare', 'run', 'finish']
            })
        });
        commands.registerCommand(ReportAnalyticsOtherCommand, {
            execute: () => this.analyticsService.report<OtherData>('sample/other', {
                source: 'command',
                kind: 'other'
            })
        });
    }
}
