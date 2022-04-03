// *****************************************************************************
// Copyright (C) 2022 Ericsson and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

/* eslint-disable @typescript-eslint/no-explicit-any */

import { inject, injectable } from 'inversify';
import { Deferred, LazyProxyFactory, ProxyProvider, ServiceProvider } from '../common';

@injectable()
export class InProcessProxyProvider implements ProxyProvider {

    protected remoteServiceProviderPromise: Promise<ServiceProvider>;

    @inject(LazyProxyFactory)
    protected lazyProxyFactory: LazyProxyFactory;

    initialize(namespace: string | symbol, serviceProvider: ServiceProvider): this {
        this.remoteServiceProviderPromise = this.getExchanger(namespace).exchange(serviceProvider);
        return this;
    }

    getProxy(serviceId: string): any {
        // getProxy will most likely get called before all code locations were able to exchange,
        // hence the need for a lazy proxy to defer potential requests until everyone initialized.
        return this.lazyProxyFactory(this.remoteServiceProviderPromise.then(
            remoteServiceProvider => remoteServiceProvider.getService<any>(serviceId)[0]
        ));
    }

    protected getExchanger(namespace: string | symbol): Exchanger<ServiceProvider> {
        return (globalThis as any)[this.getGlobalKey(namespace)] ??= new InProcessExchanger<ServiceProvider>();
    }

    protected getGlobalKey(namespace: string | symbol): string | symbol {
        if (typeof namespace === 'symbol') {
            return namespace;
        }
        // This will resolve to the same symbol when running in the same process:
        return Symbol.for(`theia#in-process-proxy-provider#${namespace}`);
    }
}

/**
 * This mechanism is analog to a barrier-lock where two parties can exchange some data before being released.
 */
export interface Exchanger<T> {
    exchange(data: T): Promise<T>;
}

export class InProcessExchanger<T> implements Exchanger<T> {

    protected done = false;
    protected waiting?: { first: T, second: Deferred<T> };

    async exchange(instance: T): Promise<T> {
        if (this.done) {
            throw new Error('the exchange already happened!');
        } else if (!this.waiting) {
            const first = instance;
            const second = new Deferred<T>();
            this.waiting = { first, second };
            return second.promise;
        } else {
            const { first, second } = this.waiting;
            second.resolve(instance);
            this.done = true;
            this.waiting = undefined;
            return first;
        }
    }
}
