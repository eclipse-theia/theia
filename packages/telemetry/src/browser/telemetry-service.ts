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
import { generateUuid } from '@theia/core/lib/common/uuid';
import { inject, injectable } from '@theia/core/shared/inversify';
import { TelemetryConsentProvider, isKindAllowedByLevel } from '../common/telemetry-consent-provider';
import { TelemetryRpc, describeTelemetryTopic } from '../common/telemetry-protocol';
import {
    TelemetryData, TelemetryReportOptions, TelemetryService, isTelemetryData, isTelemetryEventKind, snapshotTelemetryData
} from '../common/telemetry-service';
import { isValidTelemetryTopic } from '../common/telemetry-topic';

@injectable()
export class BrowserTelemetryService implements TelemetryService {

    protected readonly session = generateUuid();

    constructor(
        @inject(TelemetryRpc) protected readonly rpc: TelemetryRpc,
        @inject(TelemetryConsentProvider) protected readonly consentProvider: TelemetryConsentProvider,
        @inject(ILogger) protected readonly logger: ILogger
    ) { }

    report<T extends object>(topic: string, data?: TelemetryData<T>, options?: TelemetryReportOptions): void {
        const kind = options?.kind ?? 'usage';
        if (isTelemetryEventKind(kind) && !isKindAllowedByLevel(this.consentProvider.level, kind)) {
            return;
        }
        const attributes = options?.attributes;
        if (!isValidTelemetryTopic(topic)
            || !isTelemetryEventKind(kind)
            || (data !== undefined && !isTelemetryData(data))
            || (attributes !== undefined && !isTelemetryData(attributes))) {
            this.logger.warn(`Ignoring malformed telemetry event for topic '${describeTelemetryTopic(topic)}'.`);
            return;
        }
        const snapshot = snapshotTelemetryData(data);
        const attributesSnapshot = snapshotTelemetryData(attributes);
        this.rpc.reportEvent({
            topic,
            kind,
            data: snapshot,
            attributes: attributesSnapshot,
            session: this.session,
            timestamp: Date.now()
        }).catch(() => {
            this.logger.error(`Failed to report telemetry event for topic '${topic}'.`);
        });
    }

}
