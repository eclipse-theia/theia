/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

import { FileStat } from '@theia/filesystem/lib/common';

export const pluginPathsServicePath = '/services/plugin-paths';

// Service to create plugin configuration folders for different purpose.
export const PluginPathsService = Symbol('PluginPathsService');
export interface PluginPathsService {
    // Builds hosted log path. Create directory by this path if it is not exist on the file system.
    provideHostLogPath(): Promise<string>;
    // Builds storage path for given workspace
    provideHostStoragePath(workspace: FileStat | undefined, roots: FileStat[]): Promise<string | undefined>;
    // Returns last resolved storage path
    getLastStoragePath(): Promise<string | undefined>;
    // Returns Theia data directory (one for all Theia workspaces, so doesn't change)
    getTheiaDirPath(): Promise<string>;
}
