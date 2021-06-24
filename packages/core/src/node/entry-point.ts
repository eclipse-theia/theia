/********************************************************************************
 * Copyright (C) 2021 Ericsson and others.
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

import { injectable, inject } from 'inversify';
import { ApplicationPackage } from '@theia/application-package';

/**
 * You can quickly fetch the path of an entry point by doing a named injection on this symbol.
 *
 * Usage example:
 *
 * ```ts
 * \@injectable()
 * class {
 *     \@inject(EntryPoint) @named('@theia/core/ipc-bootstrap')
 *     protected ipcBootstrapPath: string;
 * }
 * ```
 */
export const EntryPoint = Symbol('EntryPoint');

export const EntryPointsRegistry = Symbol('EntryPointsRegistry');
export interface EntryPointsRegistry {
    getEntryPoint(name: string): string
}

@injectable()
export class EntryPointsRegistryImpl implements EntryPointsRegistry {

    @inject(ApplicationPackage)
    protected app: ApplicationPackage;

    /**
     * Throws if `name` is not found.
     */
    getEntryPoint(name: string): string {
        const entryPoint = this.app.extensionEntryPoints.get(name);
        if (!entryPoint) {
            throw new Error(`unknown entry point: "${name}"`);
        }
        return entryPoint;
    }
}
