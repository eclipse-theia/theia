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

export interface ContextKey<T> {
    set(value: T | undefined): void;
    reset(): void;
    get(): T | undefined;
}
export namespace ContextKey {
    // tslint:disable-next-line:no-any
    export const None: ContextKey<any> = Object.freeze({
        set: () => { },
        reset: () => { },
        get: () => undefined
    });
}

@injectable()
export class ContextKeyService {
    createKey<T>(key: string, defaultValue: T | undefined): ContextKey<T> {
        return ContextKey.None;
    }
    /**
     * It should be implemented by an extension, e.g. by the monaco extension.
     */
    match(expression: string, context?: HTMLElement): boolean {
        return true;
    }

}
