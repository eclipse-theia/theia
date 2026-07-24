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

import { ILogger } from '@theia/core/lib/common';
import { inject, injectable } from '@theia/core/shared/inversify';
import { TELEMETRY_ENABLED, TelemetryPreferences } from '../common/telemetry-preferences';
import { TelemetryRpc, describeTelemetryTopic } from '../common/telemetry-protocol';
import { TelemetryData, TelemetryService, isTelemetryData, snapshotTelemetryData } from '../common/telemetry-service';
import { isValidTelemetryTopic } from '../common/telemetry-topic';

@injectable()
export class BrowserTelemetryService implements TelemetryService {

    protected preferencesReady = false;

    constructor(
        @inject(TelemetryRpc) protected readonly rpc: TelemetryRpc,
        @inject(TelemetryPreferences) protected readonly preferences: TelemetryPreferences,
        @inject(ILogger) protected readonly logger: ILogger
    ) {
        this.preferences.ready.then(
            () => this.preferencesReady = true,
            () => undefined
        );
    }

    report<T extends object>(topic: string, data?: TelemetryData<T>): void {
        if (this.preferencesReady && !this.preferences[TELEMETRY_ENABLED]) {
            return;
        }
        if (!isValidTelemetryTopic(topic) || (data !== undefined && !isTelemetryData(data))) {
            this.logger.warn(`Ignoring malformed telemetry event for topic '${describeTelemetryTopic(topic)}'.`);
            return;
        }
        const snapshot = snapshotTelemetryData(data);
        this.rpc.reportEvent({ topic, data: snapshot, timestamp: Date.now() }).catch(() => {
            this.logger.error(`Failed to report telemetry event for topic '${topic}'.`);
        });
    }

}
