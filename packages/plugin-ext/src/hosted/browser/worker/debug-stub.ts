// *****************************************************************************
// Copyright (C) 2018 Red Hat, Inc. and others.
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

// eslint-disable-next-line @theia/runtime-import-check
import { interfaces } from '@theia/core/shared/inversify';
import { DebugExtImpl } from '../../../plugin/debug/debug-ext';

/* eslint-disable @typescript-eslint/no-explicit-any */
export function createDebugExtStub(container: interfaces.Container): DebugExtImpl {
    const delegate = container.get(DebugExtImpl);
    return new Proxy(delegate, {
        apply: function (target, that, args): void {
            console.error('Debug API works only in plugin container');
        }
    });
}
