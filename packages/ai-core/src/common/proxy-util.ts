// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

import { shouldBypassProxy as matchesNoProxy } from '@theia/core/shared/@theia/request';

/**
 * Checks whether the given target URL should bypass the proxy based on `no_proxy` rules.
 *
 * @param targetUrl - The URL to check against the no_proxy rules.
 * @param noProxyValue - A comma-separated list of no_proxy rules.
 * @returns `true` if the target URL should bypass the proxy, `false` otherwise.
 * @deprecated Use `shouldBypassProxy` from `@theia/core/shared/@theia/request` instead.
 */
export function shouldBypassProxy(targetUrl: string | undefined, noProxyValue: string | undefined): boolean {
    if (!targetUrl || !noProxyValue) {
        return false;
    }
    let parsed: URL;
    try {
        parsed = new URL(targetUrl);
    } catch {
        return false;
    }
    return matchesNoProxy(parsed, noProxyValue.split(','));
}
