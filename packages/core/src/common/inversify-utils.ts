// *****************************************************************************
// Copyright (C) 2025 STMicroelectronics and others.
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

import { interfaces, Container } from 'inversify';

export function bindFactory<F, C>(bind: interfaces.Bind,
    factoryId: interfaces.ServiceIdentifier<F>,
    constructor: interfaces.Newable<C>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...parameterBindings: interfaces.ServiceIdentifier<any>[]): void {
    bind(factoryId).toFactory(ctx =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (...args: any[]) => {
            const child = new Container({ defaultScope: 'Singleton' });
            child.parent = ctx.container;
            for (let i = 0; i < parameterBindings.length; i++) {
                child.bind(parameterBindings[i]).toConstantValue(args[i]);
            }
            child.bind(constructor).to(constructor);
            return child.get(constructor);
        }
    );
}
