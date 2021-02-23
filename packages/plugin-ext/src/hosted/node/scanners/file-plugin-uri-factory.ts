/********************************************************************************
 * Copyright (C) 2021 Red Hat, Inc.
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

import { injectable } from '@theia/core/shared/inversify';
import * as path from 'path';
import URI from '@theia/core/lib/common/uri';
import { FileUri } from '@theia/core/lib/node/file-uri';
import { PluginPackage } from '../../../common';
import { PluginUriFactory } from './plugin-uri-factory';
/**
 * The default implementation of PluginUriFactory simply returns a File URI from the concatenated
 * package path and relative path.
 */
@injectable()
export class FilePluginUriFactory implements PluginUriFactory {
    createUri(pkg: PluginPackage, pkgRelativePath?: string): URI {
        return FileUri.create(pkgRelativePath ? path.join(pkg.packagePath, pkgRelativePath) : pkg.packagePath);
    }
}
