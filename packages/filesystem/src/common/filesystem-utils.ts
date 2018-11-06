/********************************************************************************
 * Copyright (C) 2018 Ericsson and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { Path } from '@theia/core/lib/common';

export namespace FileSystemUtils {

    /**
     * Tildify path, replacing `home` with `~` if user's `home` is present at the beginning of the path.
     * This is a non-operation for Windows.
     * @param resourcePath
     * @param home
     */
    export function tildifyPath(resourcePath: string, home: string): string {
        const path = new Path(resourcePath);
        const isWindows = path.root && Path.isDrive(path.root.base);

        if (!isWindows && home && resourcePath.indexOf(`${home}/`) === 0) {
            return resourcePath.replace(`${home}/`, '~/');
        }

        return resourcePath;
    }
}
