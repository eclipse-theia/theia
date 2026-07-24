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

export type AnalyticsPrimitive = string | number | boolean;
export type AnalyticsValue = AnalyticsPrimitive | readonly string[] | readonly number[] | readonly boolean[];

export type AnalyticsData<T extends object> = {
    [K in keyof T]: T[K] extends AnalyticsValue ? T[K] : never;
};

function isAnalyticsPrimitive(value: unknown): value is AnalyticsPrimitive {
    return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function isAnalyticsArray(value: unknown): value is readonly AnalyticsPrimitive[] {
    if (!Array.isArray(value)) {
        return false;
    }
    if (value.length === 0) {
        return true;
    }
    if (!Object.prototype.hasOwnProperty.call(value, 0) || !isAnalyticsPrimitive(value[0])) {
        return false;
    }
    const elementType = typeof value[0];
    for (let index = 1; index < value.length; index++) {
        if (!Object.prototype.hasOwnProperty.call(value, index) || !isAnalyticsPrimitive(value[index]) || typeof value[index] !== elementType) {
            return false;
        }
    }
    return true;
}

function isAnalyticsValue(value: unknown): value is AnalyticsValue {
    return isAnalyticsPrimitive(value) || isAnalyticsArray(value);
}

export function isAnalyticsData(data: unknown): data is Record<string, AnalyticsValue> {
    // eslint-disable-next-line no-null/no-null
    if (typeof data !== 'object' || data === null || Array.isArray(data) || Object.getPrototypeOf(data) !== Object.prototype) {
        return false;
    }
    return Object.values(data).every(isAnalyticsValue);
}

export function snapshotAnalyticsData<T extends object>(data: AnalyticsData<T> | undefined): AnalyticsData<T> | undefined {
    if (data === undefined) {
        return undefined;
    }
    const snapshot = Object.fromEntries(Object.entries(data).map(([key, value]) => [
        key,
        Array.isArray(value) ? Object.freeze([...value]) : value
    ]));
    return Object.freeze(snapshot) as AnalyticsData<T>;
}

export const AnalyticsService = Symbol('AnalyticsService');

export interface AnalyticsService {
    report<T extends object>(topic: string, data?: AnalyticsData<T>): void;
}
