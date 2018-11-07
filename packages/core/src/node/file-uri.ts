/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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

import Uri from 'vscode-uri';
import URI from '../common/uri';
import { isWindows } from '../common/os';

export namespace FileUri {

    const windowsDriveRegex = /^([^:/?#]+?):$/;

    /**
     * Creates a new file URI from the filesystem path argument.
     * @param fsPath the filesystem path.
     */
    export function create(fsPath_: string) {
        return new URI(Uri.file(fsPath_));
    }

    /**
     * Returns with the platform specific FS path that is represented by the URI argument.
     *
     * @param uri the file URI that has to be resolved to a platform specific FS path.
     */
    export function fsPath(uri: URI | string): string {
        if (typeof uri === 'string') {
            return fsPath(new URI(uri));
        } else {
            /*
             * A uri for the root of a Windows drive, eg file:\\\c%3A, is converted to c:
             * by the Uri class.  However file:\\\c%3A is unambiguously a uri to the root of
             * the drive and c: is interpreted as the default directory for the c drive
             * (by, for example, the readdir function in the fs-extra module).
             * A backslash must be appended to the drive, eg c:\, to ensure the correct path.
             */
            // tslint:disable-next-line:no-any
            const fsPathFromVsCodeUri = (uri as any).codeUri.fsPath;
            if (isWindows) {
                const isWindowsDriveRoot = windowsDriveRegex.exec(fsPathFromVsCodeUri);
                if (isWindowsDriveRoot) {
                    return fsPathFromVsCodeUri + '\\';
                }
            }
            return fsPathFromVsCodeUri;
        }
    }

}
