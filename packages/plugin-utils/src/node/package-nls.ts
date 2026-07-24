// *****************************************************************************
// Copyright (C) 2021 TypeFox and others.
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
import * as fs from 'fs-extra';
import { isENOENT } from '../utils';
import {
    coerceLocalizations,
    type PackageTranslation,
} from '../package-nls';

export {
    coerceLocalizations,
    localizePackage,
    localizeWithResolver,
    type LocalizePackageCallback,
    type PackageTranslation,
} from '../package-nls';

export async function loadPackageTranslations(pluginPath: string, locale?: string): Promise<PackageTranslation> {
    const defaultPath = path.join(pluginPath, 'package.nls.json');
    try {
        const defaultValue = coerceLocalizations(await fs.readJson(defaultPath));
        if (locale) {
            const localizedPath = path.join(pluginPath, `package.nls.${locale}.json`);
            if (await fs.pathExists(localizedPath)) {
                return {
                    translation: coerceLocalizations(await fs.readJson(localizedPath)),
                    default: defaultValue
                };
            }
        }
        return { default: defaultValue };
    } catch (error) {
        if (isENOENT(error)) {
            return {};
        }
        throw error;
    }
}
