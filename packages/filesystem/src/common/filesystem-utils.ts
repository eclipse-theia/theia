// *****************************************************************************
// Copyright (C) 2018 Ericsson and others.
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

import { FileStat } from '../common/files';
import URI from '@theia/core/lib/common/uri';

export namespace FileSystemUtils {
    export const FILE_NAME_SEPARATOR = ' ';

    /**
     * Generate unique URI for a given parent which does not collide
     *
     * @param parent the `FileStat` of the parent
     * @param targetUri the initial URI
     * @param isDirectory indicates whether the given targetUri represents a directory
     * @param suffix an optional string to append to the file name, in case of collision (e.g. `copy`)
     */
    export function generateUniqueResourceURI(parent: FileStat, targetUri: URI, isDirectory: boolean, suffix?: string): URI {
        const children = !parent.children ? [] : parent.children!.map(child => child.resource);
        let name = targetUri.path.name;
        let extension = targetUri.path.ext;
        if (!name) {
            // special case for dotfiles (e.g. '.foobar'): use the extension as the name
            name = targetUri.path.ext;
            extension = '';
        }
        // we want the path base for directories with the source path `foo.bar` to be generated as `foo.bar copy` and not `foo copy.bar` as we do for files
        if (isDirectory) {
            name = name + extension;
            extension = '';
        }

        let base = name + extension;
        // test if the name already contains the suffix or the suffix + index, so we don't add it again
        const nameRegex = RegExp(`.*${FileSystemUtils.FILE_NAME_SEPARATOR}${suffix}(${FileSystemUtils.FILE_NAME_SEPARATOR}[0-9]*)?$`);
        if (suffix && !nameRegex.test(name) && children.some(child => child.path.base === base)) {
            name = name + FILE_NAME_SEPARATOR + suffix;
            base = name + extension;
        }
        if (suffix && nameRegex.test(name)) {
            // remove the existing index from the name, so we can generate a new one
            name = name.replace(RegExp(`${FILE_NAME_SEPARATOR}[0-9]*$`), '');
        }
        let index = 0;
        while (children.some(child => child.path.base === base)) {
            index = index + 1;
            base = name + FILE_NAME_SEPARATOR + index + extension;
        }
        return parent.resource.resolve(base);
    }
}
