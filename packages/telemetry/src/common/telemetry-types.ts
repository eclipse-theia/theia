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

/** @experimental */
export type TelemetryEventKind = 'usage' | 'error' | 'crash';

/** @experimental */
export function isTelemetryEventKind(value: unknown): value is TelemetryEventKind {
    return value === 'usage' || value === 'error' || value === 'crash';
}

/** @experimental */
export type TelemetryLevel = 'off' | 'crash' | 'error' | 'all';

/** @experimental */
export function isKindAllowedByLevel(level: TelemetryLevel, kind: TelemetryEventKind): boolean {
    return level === 'all'
        || level === 'error' && (kind === 'error' || kind === 'crash')
        || level === 'crash' && kind === 'crash';
}

/** @experimental */
export const BACKEND_TELEMETRY_SESSION = 'backend';
