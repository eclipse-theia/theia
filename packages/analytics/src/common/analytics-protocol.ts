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

import { AnalyticsData, AnalyticsValue, isAnalyticsData } from './analytics-service';
import { isValidAnalyticsTopic } from './analytics-topic';

export interface AnalyticsEvent<T extends object = Record<string, AnalyticsValue>> {
    readonly topic: string;
    readonly data?: AnalyticsData<T>;
    readonly timestamp: number;
}

export function isValidAnalyticsEvent(event: unknown): event is AnalyticsEvent {
    // eslint-disable-next-line no-null/no-null
    if (typeof event !== 'object' || event === null) {
        return false;
    }
    const candidate = event as Partial<AnalyticsEvent>;
    return isValidAnalyticsTopic(candidate.topic)
        && typeof candidate.timestamp === 'number'
        && Number.isFinite(candidate.timestamp)
        && (candidate.data === undefined || isAnalyticsData(candidate.data));
}

export function describeAnalyticsTopic(topic: unknown): string {
    return typeof topic === 'string' ? topic : '<invalid>';
}

export function describeAnalyticsEventTopic(event: unknown): string {
    // eslint-disable-next-line no-null/no-null
    if (typeof event !== 'object' || event === null) {
        return '<invalid>';
    }
    return describeAnalyticsTopic((event as { topic?: unknown }).topic);
}

export const analyticsServicePath = '/services/analytics';

export const AnalyticsRpc = Symbol('AnalyticsRpc');

export interface AnalyticsRpc {
    reportEvent(event: AnalyticsEvent): Promise<void>;
}
