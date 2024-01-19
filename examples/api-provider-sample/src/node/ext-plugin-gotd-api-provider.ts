// *****************************************************************************
// Copyright (C) 2024 EclipseSource and others.
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
import { injectable } from '@theia/core/shared/inversify';
import { ExtPluginApi, ExtPluginApiProvider } from '@theia/plugin-ext-headless';

@injectable()
export class ExtPluginGotdApiProvider implements ExtPluginApiProvider {
    provideApi(): ExtPluginApi {
        // We can support both backend plugins and headless plugins, so we have only one
        // entry-point script. Moreover, the application build packages that script in
        // the `../backend/` directory from its source `../plugin/` location, alongside
        // the scripts for all other plugin API providers.
        const universalInitPath = path.join(__dirname, '../backend/gotd-api-init');
        return {
            backendInitPath: universalInitPath,
            headlessInitPath: universalInitPath
        };
    }
}
