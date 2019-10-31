/********************************************************************************
 * Copyright (C) 2019 TypeFox and others.
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

import { injectable } from 'inversify';
import { Disposable } from '../common/disposable';

export interface ColorDefaults {
    light?: string
    dark?: string
    hc?: string
}

export interface ColorOptions {
    defaults?: ColorDefaults
    description: string
}

/**
 * It should be implemented by an extension, e.g. by the monaco extension.
 */
@injectable()
export class ColorRegistry {

    *getColors(): IterableIterator<string> { }

    getCurrentColor(id: string): string | undefined {
        return undefined;
    }

    register(id: string, options: ColorOptions): Disposable {
        return Disposable.NULL;
    }

}
