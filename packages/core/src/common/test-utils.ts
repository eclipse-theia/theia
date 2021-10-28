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

import { MaybePromise } from './types';

/**
 * Errors and expectation failures are propagated to Mocha through errors.
 *
 * Use this function to wrap a test case that is flaky and fails the CI for no good reason.
 *
 * If you see this function used anywhere it means there is an issue we need to fix.
 */
export function TODO_FIX_FLAKY_TEST<R, A extends unknown[]>(
    test: (this: Mocha.Context, ...args: A) => MaybePromise<R>
): (this: Mocha.Context, ...args: A) => Promise<R> {
    return async function (this: Mocha.Context): Promise<R> {
        try {
            return await test.apply(this, arguments);
        } catch (error) {
            console.error('A FLAKY TEST FAILED WITH ERROR:', error);
            this.skip();
        }
    };
}
