// *****************************************************************************
// Copyright (C) 2026 STMicroelectronics and others.
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

/**
 * Workaround: Node 21+ defines `globalThis.navigator`, which breaks VS Code
 * extensions that use its absence to detect a Node.js environment.
 * Unless explicitly opted in via `THEIA_SUPPORT_NODE_GLOBAL_NAVIGATOR=true`,
 * override it with a getter that returns `undefined` to match VS Code behavior.
 * See https://github.com/eclipse-theia/theia/issues/16233
 *
 * @param env the environment variables to read the opt-in flag from
 * @param target the object on which to override the `navigator` property (defaults to `globalThis`)
 */
export function suppressNodeNavigator(env: Record<string, string | undefined> = process.env, target: typeof globalThis = globalThis): void {
    if (env['THEIA_SUPPORT_NODE_GLOBAL_NAVIGATOR'] !== 'true') {
        Object.defineProperty(target, 'navigator', {
            get: () => undefined,
            configurable: true,
        });
    }
}
