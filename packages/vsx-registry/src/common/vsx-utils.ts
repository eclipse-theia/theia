/********************************************************************************
 * Copyright (C) 2020 Ericsson and others.
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

import * as semver from 'semver';
import { VSCODE_DEFAULT_API_VERSION } from '@theia/plugin-ext-vscode/lib/common/plugin-vscode-environment';

/**
 * Determine if the engine is valid.
 * @param engine the engine.
 *
 * @returns `true` if the engine satisfies the API version.
 */
export function isEngineValid(engines: string[]): boolean {
    const engine = engines.find(e => e.startsWith('vscode'));
    if (engine) {
        return engine === '*' || semver.satisfies(VSCODE_DEFAULT_API_VERSION, engine.split('@')[1]);
    }
    return false;
}
