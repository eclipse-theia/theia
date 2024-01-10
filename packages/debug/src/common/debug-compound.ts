// *****************************************************************************
// Copyright (C) 2022 EclipseSource and others.
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

import { isObject } from '@theia/core/lib/common';
import { TaskIdentifier } from '@theia/task/lib/common';

export const defaultCompound: DebugCompound = { name: 'Compound', configurations: [] };

export interface DebugCompound {
    name: string;
    stopAll?: boolean;
    preLaunchTask?: string | TaskIdentifier;
    configurations: (string | { name: string, folder: string })[];
}

export namespace DebugCompound {
    export function is(arg: unknown): arg is DebugCompound {
        return isObject(arg) && 'name' in arg && 'configurations' in arg;
    }
}
