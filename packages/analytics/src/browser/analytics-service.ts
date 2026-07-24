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
import { AnalyticsRpc, describeAnalyticsTopic } from '../common/analytics-protocol';
import { AnalyticsData, AnalyticsService, isAnalyticsData, snapshotAnalyticsData } from '../common/analytics-service';
import { isValidAnalyticsTopic } from '../common/analytics-topic';

@injectable()
export class BrowserAnalyticsService implements AnalyticsService {

    constructor(
        @inject(AnalyticsRpc) protected readonly rpc: AnalyticsRpc,
        @inject(ILogger) protected readonly logger: ILogger
    ) { }

    report<T extends object>(topic: string, data?: AnalyticsData<T>): void {
        if (!isValidAnalyticsTopic(topic) || (data !== undefined && !isAnalyticsData(data))) {
            this.logger.warn(`Ignoring malformed analytics event for topic '${describeAnalyticsTopic(topic)}'.`);
            return;
        }
        const snapshot = snapshotAnalyticsData(data);
        this.rpc.reportEvent({ topic, data: snapshot, timestamp: Date.now() }).catch(() => {
            this.logger.error(`Failed to report analytics event for topic '${topic}'.`);
        });
    }

}
