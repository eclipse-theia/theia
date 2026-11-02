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

import * as path from 'path';
import { APP_HOST, APP_SCHEME } from '../electron-common/app-scheme';

export { APP_HOST, APP_ORIGIN, APP_SCHEME, appUri, isAppFileUrl } from '../electron-common/app-scheme';

/**
 * The absolute path of the frontend file an application-scheme URL names, or `undefined` for a URL of
 * another scheme or host, or a path that would leave the frontend directory. The URL parser removes
 * dot segments; the path check covers what it does not normalize, such as encoded separators.
 */
export function resolveAppFile(url: string, frontendRoot: string, pathModule: path.PlatformPath = path): string | undefined {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return undefined;
    }
    if (parsed.protocol !== `${APP_SCHEME}:` || parsed.host !== APP_HOST) {
        return undefined;
    }
    let pathname: string;
    try {
        pathname = decodeURIComponent(parsed.pathname);
    } catch {
        return undefined;
    }
    const root = pathModule.resolve(frontendRoot);
    const file = pathModule.normalize(pathModule.join(root, pathname));
    return file.startsWith(root + pathModule.sep) ? file : undefined;
}
