/*
 * Copyright (C) 2018 Red Hat, Inc.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v1.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v10.html
 *
 * Contributors:
 *   Red Hat, Inc. - initial API and implementation
 */

export class ExtendedPromise implements Promise<any> {
    private delegate: Promise<any>;
    private resolveDelegate: (value?: any) => void;
    private rejectDelegate: (reason?: any) => void;
    constructor() {
        this.delegate = new Promise((resolve, reject) => {
            this.resolveDelegate = resolve;
            this.rejectDelegate = reject;
        });
    }

    resolve(value: any): void {
        this.resolveDelegate(value);
    }

    reject(err: any): void {
        this.rejectDelegate(err);
    }

    then<TResult1 = any, TResult2 = never>(onfulfilled?: (value: any) => TResult1 | PromiseLike<TResult1>,
        onrejected?: (reason: any) => TResult2 | PromiseLike<TResult2>): Promise<TResult1 | TResult2> {
        return this.delegate.then(onfulfilled, onrejected);
    }
    catch<TResult = never>(onrejected?: (reason: any) => TResult | PromiseLike<TResult>): Promise<any> {
        return this.delegate.catch(onrejected);
    }
    [Symbol.toStringTag]: "Promise";

}
