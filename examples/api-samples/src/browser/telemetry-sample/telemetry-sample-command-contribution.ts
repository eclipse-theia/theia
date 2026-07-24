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

import { Command, CommandContribution, CommandRegistry } from '@theia/core/lib/common';
import { inject, injectable } from '@theia/core/shared/inversify';
import { TelemetryService } from '@theia/telemetry/lib/common';

const TELEMETRY_SAMPLE_CATEGORY = 'Telemetry Samples';

export const ReportTelemetryStartedCommand: Command = {
    id: 'telemetry-samples.report-started',
    label: 'Report Started Event',
    category: TELEMETRY_SAMPLE_CATEGORY
};

export const ReportTelemetryCompletedCommand: Command = {
    id: 'telemetry-samples.report-completed',
    label: 'Report Completed Event',
    category: TELEMETRY_SAMPLE_CATEGORY
};

export const ReportTelemetryOtherCommand: Command = {
    id: 'telemetry-samples.report-other',
    label: 'Report Other Event',
    category: TELEMETRY_SAMPLE_CATEGORY
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
export class TelemetrySampleCommandContribution implements CommandContribution {

    @inject(TelemetryService)
    protected readonly telemetryService: TelemetryService;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(ReportTelemetryStartedCommand, {
            execute: () => this.telemetryService.report<StartedData>('sample/telemetry/started', {
                source: 'command',
                attempt: 1,
                interactive: true
            })
        });
        commands.registerCommand(ReportTelemetryCompletedCommand, {
            execute: () => this.telemetryService.report<CompletedData>('sample/telemetry/completed', {
                source: 'command',
                duration: 125,
                stages: ['prepare', 'run', 'finish']
            }, {
                kind: 'error',
                attributes: {
                    origin: 'api-samples'
                }
            })
        });
        commands.registerCommand(ReportTelemetryOtherCommand, {
            execute: () => this.telemetryService.report<OtherData>('sample/other', {
                source: 'command',
                kind: 'other'
            })
        });
    }
}
