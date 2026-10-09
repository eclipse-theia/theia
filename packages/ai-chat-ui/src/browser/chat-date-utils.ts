// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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

import { nls } from '@theia/core';

/**
 * The relative time units supported by `formatTimeAgo` with their approximate
 * lengths in milliseconds, from largest to smallest. The first unit that fits
 * into the elapsed time is used.
 */
const RELATIVE_TIME_UNITS: ReadonlyArray<readonly [Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 31_557_600_000], // 365.25 days
    ['month', 2_629_800_000], // 30.44 days
    ['week', 604_800_000],
    ['day', 86_400_000],
    ['hour', 3_600_000],
    ['minute', 60_000],
    ['second', 1_000]
];

let cachedRelativeTimeFormat: { locale: string | undefined; format: Intl.RelativeTimeFormat } | undefined;

/**
 * Returns a cached `Intl.RelativeTimeFormat` for the current Theia locale,
 * falling back to English if the locale is not supported.
 */
function getRelativeTimeFormat(): Intl.RelativeTimeFormat {
    // Theia locale ids may use '_' as region separator while `Intl` expects BCP-47 ('-').
    const locale = nls.locale?.replace('_', '-');
    if (cachedRelativeTimeFormat === undefined || cachedRelativeTimeFormat.locale !== locale) {
        try {
            cachedRelativeTimeFormat = { locale, format: new Intl.RelativeTimeFormat(locale, { numeric: 'always' }) };
        } catch {
            cachedRelativeTimeFormat = { locale, format: new Intl.RelativeTimeFormat('en', { numeric: 'always' }) };
        }
    }
    return cachedRelativeTimeFormat.format;
}

/**
 * Formats a timestamp as a human-readable relative time string (e.g., "2 hours ago").
 *
 * The largest unit that fits into the elapsed time is used and the value is rounded
 * down so that it never crosses into the next larger unit. Timestamps less than a
 * second away render as "0 seconds ago", future ones as "in ...".
 * @param timestamp - The timestamp in milliseconds
 */
export function formatTimeAgo(timestamp: number): string {
    if (typeof Intl === 'undefined' || typeof Intl.RelativeTimeFormat === 'undefined') {
        // Environments without `Intl.RelativeTimeFormat` get an absolute date instead.
        return new Date(timestamp).toLocaleString();
    }
    const elapsed = Date.now() - timestamp;
    const direction = elapsed >= 0 ? -1 : 1; // `Intl` expects negative values for the past
    const duration = Math.abs(elapsed);
    for (const [unit, unitLength] of RELATIVE_TIME_UNITS) {
        if (duration >= unitLength) {
            return getRelativeTimeFormat().format(direction * Math.floor(duration / unitLength), unit);
        }
    }
    return getRelativeTimeFormat().format(0, 'second');
}
