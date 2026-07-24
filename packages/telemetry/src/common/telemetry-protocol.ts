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

import { TelemetryData, TelemetryValue, isTelemetryData } from './telemetry-service';
import { isValidTelemetryTopic } from './telemetry-topic';

export interface TelemetryEvent<T extends object = Record<string, TelemetryValue>> {
    readonly topic: string;
    readonly data?: TelemetryData<T>;
    readonly timestamp: number;
}

export function isValidTelemetryEvent(event: unknown): event is TelemetryEvent {
    // eslint-disable-next-line no-null/no-null
    if (typeof event !== 'object' || event === null) {
        return false;
    }
    const candidate = event as Partial<TelemetryEvent>;
    return isValidTelemetryTopic(candidate.topic)
        && typeof candidate.timestamp === 'number'
        && Number.isFinite(candidate.timestamp)
        && (candidate.data === undefined || isTelemetryData(candidate.data));
}

export function describeTelemetryTopic(topic: unknown): string {
    return typeof topic === 'string' ? topic : '<invalid>';
}

export function describeTelemetryEventTopic(event: unknown): string {
    // eslint-disable-next-line no-null/no-null
    if (typeof event !== 'object' || event === null) {
        return '<invalid>';
    }
    return describeTelemetryTopic((event as { topic?: unknown }).topic);
}

export const telemetryServicePath = '/services/telemetry';

export const TelemetryRpc = Symbol('TelemetryRpc');

export interface TelemetryRpc {
    reportEvent(event: TelemetryEvent): Promise<void>;
}
