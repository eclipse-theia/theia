// *****************************************************************************
// Copyright (C) 2026 theia-ide and others.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/** Normalizes URL / quick-input strings (NBSP, trim). */
export function normalizeMiniBrowserOpenUrl(url: string): string {
    return url.replace(/\u00a0/g, ' ').trim();
}
