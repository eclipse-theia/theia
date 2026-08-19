// *****************************************************************************
// Copyright (C) 2026 Maksim Kachurin and others.
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

import * as fs from 'fs-extra';
import { ApplicationPackage } from '@theia/application-package';

/**
 * Write `lib/frontend/extensions.json` (Theia extension packages) for the About dialog,
 * matching the backend Theia extension build output.
 */
export async function writeBrowserOnlyExtensionsList(applicationPackage: ApplicationPackage): Promise<void> {
    const extensions = applicationPackage.extensionPackages.map(({ name, version }) => ({ name, version }));
    await fs.writeJson(applicationPackage.lib('frontend', 'extensions.json'), extensions, { spaces: 2 });
}
