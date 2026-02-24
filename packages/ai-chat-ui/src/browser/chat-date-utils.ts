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
import { formatDistance } from 'date-fns';
import * as locales from 'date-fns/locale';

/**
 * Returns the date-fns locale matching the current Theia locale.
 */
export function getDateFnsLocale(): locales.Locale {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return nls.locale ? (locales as any)[nls.locale] ?? locales.enUS : locales.enUS;
}

/**
 * Formats a timestamp as a human-readable relative time string (e.g., "2 hours ago").
 * @param timestamp - The timestamp in milliseconds
 * @param addSuffix - Whether to add "ago" suffix (default: true)
 */
export function formatTimeAgo(timestamp: number, addSuffix: boolean = true): string {
    return formatDistance(new Date(timestamp), new Date(), {
        addSuffix,
        locale: getDateFnsLocale()
    });
}
