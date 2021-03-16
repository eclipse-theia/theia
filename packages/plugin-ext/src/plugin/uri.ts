/********************************************************************************
 * Copyright (C) 2021 Red Hat, Inc. and others.
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

import { URI as Uri } from 'vscode-uri';
import * as nodePath from 'path';

const posixPath = nodePath.posix || nodePath;

/**
 * Compatible class with vscode.Uri (API).
 */
export class URI extends Uri {
    /**
     * Joins one or more input paths to the path of URI.
     * '/' is used as the directory separation character.
     *
     * @param uri The input URI.
     * @param paths The paths to be joined with the path of URI.
     * @returns A URI with the joined path. All other properties of the URI (scheme, authority, query, fragments, ...) will be taken from the input URI.
     */
     static joinPath(uri: Uri, ...paths: string[]): Uri {
       return uri.with({ path: posixPath.join(uri.path, ...paths) });
     }
}
