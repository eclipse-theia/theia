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

import { isObject } from '@theia/core/lib/common/types';
import {
    TelemetryData, TelemetryEventKind, TelemetryReportOptions, TelemetryValue, isTelemetryData, isTelemetryEventKind, snapshotTelemetryData
} from './telemetry-service';
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
    if (!isObject<TelemetryEvent>(event)) {
        return false;
    }
    return isValidTelemetryTopic(event.topic)
        && isTelemetryEventKind(event.kind)
        && typeof event.session === 'string'
        && event.session.length > 0
        && typeof event.timestamp === 'number'
        && Number.isFinite(event.timestamp)
        && (event.data === undefined || isTelemetryData(event.data))
        && (event.attributes === undefined || isTelemetryData(event.attributes));
}

/** @experimental */
export function describeTelemetryTopic(topic: unknown): string {
    return typeof topic === 'string' ? topic : '<invalid>';
}

/** @experimental */
export function describeTelemetryEventTopic(event: unknown): string {
    if (!isObject(event)) {
        return '<invalid>';
    }
    return describeTelemetryTopic(event.topic);
}

/** @experimental */
export function createTelemetryEvent<T extends object>(
    topic: string,
    session: string,
    data?: TelemetryData<T>,
    options?: TelemetryReportOptions
): TelemetryEvent<T> {
    return {
        topic,
        kind: options?.kind ?? 'usage',
        data,
        attributes: options?.attributes,
        session,
        timestamp: Date.now()
    };
}

/** @experimental */
export function snapshotTelemetryEvent(event: TelemetryEvent): TelemetryEvent {
    return Object.freeze({
        topic: event.topic,
        kind: event.kind,
        data: snapshotTelemetryData(event.data),
        attributes: snapshotTelemetryData(event.attributes),
        session: event.session,
        timestamp: event.timestamp
    });
}

/** @experimental */
export const telemetryServicePath = '/services/telemetry';

/** @experimental */
export const TelemetryRpc = Symbol('TelemetryRpc');

/** @experimental */
export interface TelemetryRpc {
    notifyEvent(event: TelemetryEvent): void;
    getLocalSinkInterests(): Promise<string[]>;
}
