/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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
import { Event } from '@theia/core/lib/common';
import { ContextKeyService, ContextKey, ContextKeyChangeEvent, ContextKeyExpr, ContextKeyServiceTarget, Context } from './context-key';

@injectable()
export class MockContextKeyService implements ContextKeyService {

    dispose(): void { }

    onDidChangeContext: Event<ContextKeyChangeEvent>;

    createKey<T>(key: string, defaultValue: T | undefined): ContextKey<T> {
        return {
            get: () => undefined,
            set(v: T) { },
            reset() { }
        };
    }

    contextMatchesRules(rules: ContextKeyExpr | undefined): boolean {
        return true;
    }

    getContextKeyValue<T>(key: string): T | undefined {
        return undefined;
    }

    createScoped(target?: ContextKeyServiceTarget): ContextKeyService {
        return this;
    }

    getContext(target: ContextKeyServiceTarget | null): Context {
        return {
            getValue: () => undefined
        };
    }
}
