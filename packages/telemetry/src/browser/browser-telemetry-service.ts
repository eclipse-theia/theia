// *****************************************************************************
// Copyright (C) 2026 STMicroelectronics and others.
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

import { FrontendIdProvider } from '@theia/core/lib/browser/messaging/frontend-id-provider';
import { ILogger } from '@theia/core/lib/common';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { TelemetryConsentProvider, isKindAllowedByLevel } from '../common/telemetry-consent-provider';
import {
    TelemetryRpc, createTelemetryEvent, describeTelemetryTopic, isValidTelemetryEvent, snapshotTelemetryEvent
} from '../common/telemetry-protocol';
import { TelemetryData, TelemetryReportOptions, TelemetryService } from '../common/telemetry-service';
import { matchesTelemetryTopic } from '../common/telemetry-topic';

@injectable()
export class BrowserTelemetryService implements TelemetryService {

    protected localSinkInterests: readonly string[] | undefined;
    protected localSinkInterestsPromise: Promise<void> | undefined;

    @inject(TelemetryRpc)
    protected readonly rpc: TelemetryRpc;

    @inject(FrontendIdProvider)
    protected readonly frontendIdProvider: FrontendIdProvider;

    @inject(TelemetryConsentProvider)
    protected readonly consentProvider: TelemetryConsentProvider;

    @inject(ILogger) @named('telemetry:BrowserTelemetryService')
    protected readonly logger: ILogger;

    report<T extends object>(topic: string, data?: TelemetryData<T>, options?: TelemetryReportOptions): void {
        const event = createTelemetryEvent(topic, this.frontendIdProvider.getId(), data, options);
        if (!isValidTelemetryEvent(event)) {
            this.logger.warn(`Ignoring malformed telemetry event for topic '${describeTelemetryTopic(topic)}'.`);
            return;
        }
        this.fetchLocalSinkInterests();
        if (!isKindAllowedByLevel(this.consentProvider.level, event.kind)
            && this.localSinkInterests !== undefined
            && !this.localSinkInterests.some(pattern => matchesTelemetryTopic(pattern, event.topic))) {
            return;
        }
        this.rpc.notifyEvent(snapshotTelemetryEvent(event));
    }

    protected fetchLocalSinkInterests(): void {
        if (!this.localSinkInterestsPromise) {
            this.localSinkInterestsPromise = this.rpc.getLocalSinkInterests().then(
                interests => { this.localSinkInterests = interests; },
                () => { this.localSinkInterests = []; }
            );
        }
    }

}
