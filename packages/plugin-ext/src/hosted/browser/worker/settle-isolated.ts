// *****************************************************************************
// Copyright (C) 2026 robertjndw
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

// A tagged result rather than `R | undefined`, so a `prepare()` that legitimately resolves to
// `undefined` isn't mistaken for a failure and dropped from the result.
type Outcome<T, R> = { ok: true; value: R } | { ok: false; item: T; error: unknown };

/**
 * Runs `prepare` for every item concurrently, preserving the original order in the result. An
 * item whose `prepare` rejects is reported via `onError` and left out of the result rather than
 * failing the whole batch - so, for example, one plugin whose manifest can't be loaded (a 404 on
 * `package.json`) can't prevent every other plugin from loading.
 */
export async function settleIsolated<T, R>(
    items: readonly T[],
    prepare: (item: T) => Promise<R>,
    onError: (item: T, error: unknown) => void
): Promise<R[]> {
    const settled = await Promise.all(items.map(item => prepare(item).then(
        (value): Outcome<T, R> => ({ ok: true, value }),
        (error): Outcome<T, R> => ({ ok: false, item, error })
    )));
    const result: R[] = [];
    for (const outcome of settled) {
        if (outcome.ok) {
            result.push(outcome.value);
        } else {
            onError(outcome.item, outcome.error);
        }
    }
    return result;
}
