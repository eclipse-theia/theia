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

import { TelemetryData, TelemetryEventKind, TelemetryValue, isTelemetryData, isTelemetryEventKind } from './telemetry-service';
import { isValidTelemetryTopic } from './telemetry-topic';

/** @experimental */
export interface TelemetryEvent<T extends object = Record<string, TelemetryValue>> {
    readonly topic: string;
    readonly kind: TelemetryEventKind;
    readonly data?: TelemetryData<T>;
    readonly attributes?: TelemetryData<Record<string, TelemetryValue>>;
    readonly session: string;
    readonly timestamp: number;
}

/** @experimental */
export function isValidTelemetryEvent(event: unknown): event is TelemetryEvent {
    // eslint-disable-next-line no-null/no-null
    if (typeof event !== 'object' || event === null) {
        return false;
    }
    const candidate = event as Partial<TelemetryEvent>;
    return isValidTelemetryTopic(candidate.topic)
        && isTelemetryEventKind(candidate.kind)
        && typeof candidate.session === 'string'
        && candidate.session.length > 0
        && typeof candidate.timestamp === 'number'
        && Number.isFinite(candidate.timestamp)
        && (candidate.data === undefined || isTelemetryData(candidate.data))
        && (candidate.attributes === undefined || isTelemetryData(candidate.attributes));
}

/** @experimental */
export function describeTelemetryTopic(topic: unknown): string {
    return typeof topic === 'string' ? topic : '<invalid>';
}

/** @experimental */
export function describeTelemetryEventTopic(event: unknown): string {
    // eslint-disable-next-line no-null/no-null
    if (typeof event !== 'object' || event === null) {
        return '<invalid>';
    }
    return describeTelemetryTopic((event as { topic?: unknown }).topic);
}

/** @experimental */
export const telemetryServicePath = '/services/telemetry';

/** @experimental */
export const TelemetryRpc = Symbol('TelemetryRpc');

/** @experimental */
export interface TelemetryRpc {
    reportEvent(event: TelemetryEvent): Promise<void>;
    getLocalSinkInterests(): Promise<string[]>;
}
