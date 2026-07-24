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

/** @experimental */
export type TelemetryPrimitive = string | number | boolean;
/** @experimental */
export type TelemetryValue = TelemetryPrimitive | readonly string[] | readonly number[] | readonly boolean[];

/** @experimental */
export type TelemetryData<T extends object> = {
    [K in keyof T]: T[K] extends TelemetryValue ? T[K] : never;
};

function isTelemetryPrimitive(value: unknown): value is TelemetryPrimitive {
    return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function isTelemetryArray(value: unknown): value is readonly TelemetryPrimitive[] {
    if (!Array.isArray(value)) {
        return false;
    }
    if (value.length === 0) {
        return true;
    }
    if (!Object.prototype.hasOwnProperty.call(value, 0) || !isTelemetryPrimitive(value[0])) {
        return false;
    }
    const elementType = typeof value[0];
    for (let index = 1; index < value.length; index++) {
        if (!Object.prototype.hasOwnProperty.call(value, index) || !isTelemetryPrimitive(value[index]) || typeof value[index] !== elementType) {
            return false;
        }
    }
    return true;
}

function isTelemetryValue(value: unknown): value is TelemetryValue {
    return isTelemetryPrimitive(value) || isTelemetryArray(value);
}

/** @experimental */
export function isTelemetryData(data: unknown): data is Record<string, TelemetryValue> {
    // eslint-disable-next-line no-null/no-null
    if (typeof data !== 'object' || data === null || Array.isArray(data) || Object.getPrototypeOf(data) !== Object.prototype) {
        return false;
    }
    return Object.values(data).every(isTelemetryValue);
}

/** @experimental */
export function snapshotTelemetryData<T extends object>(data: TelemetryData<T> | undefined): TelemetryData<T> | undefined {
    if (data === undefined) {
        return undefined;
    }
    const snapshot = Object.fromEntries(Object.entries(data).map(([key, value]) => [
        key,
        Array.isArray(value) ? Object.freeze([...value]) : value
    ]));
    return Object.freeze(snapshot) as TelemetryData<T>;
}

/** @experimental */
export type TelemetryEventKind = 'usage' | 'error' | 'crash';

/** @experimental */
export function isTelemetryEventKind(value: unknown): value is TelemetryEventKind {
    return value === 'usage' || value === 'error' || value === 'crash';
}

/** @experimental */
export interface TelemetryReportOptions {
    readonly kind?: TelemetryEventKind;
    readonly attributes?: TelemetryData<Record<string, TelemetryValue>>;
}

/** @experimental */
export const TelemetryService = Symbol('TelemetryService');

/** @experimental */
export interface TelemetryService {
    report<T extends object>(topic: string, data?: TelemetryData<T>, options?: TelemetryReportOptions): void;
}
