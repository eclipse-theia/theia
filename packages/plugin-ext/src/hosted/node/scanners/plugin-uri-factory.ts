// *****************************************************************************
// Copyright (C) 2021 Red Hat, Inc.
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

import URI from '@theia/core/lib/common/uri';
import { PluginPackage } from '../../../common';

export const PluginUriFactory = Symbol('PluginUriFactory');
/**
 * Creates URIs for resources used in plugin contributions. Projects where plugin host is not located on the back-end
 * machine and therefor resources cannot be loaded from the local file system in the back end can override the factory.
 */
export interface PluginUriFactory {
    /**
     * Returns a URI that allows a file to be loaded given a plugin package and a path relative to the plugin's package path
     *
     * @param pkg the package this the file is contained in
     * @param pkgRelativePath the path of the file relative to the package path, e.g. 'resources/snippets.json'
     */
    createUri(pkg: PluginPackage, pkgRelativePath?: string): URI;
}
