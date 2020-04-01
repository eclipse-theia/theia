/********************************************************************************
 * Copyright (C) 2019 Red Hat, Inc. and others.
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

import { Disposable, DisposableCollection, Emitter } from '@theia/core/lib/common';
import { ScmInput, ScmInputOptions } from './scm-input';
import { ScmProvider } from './scm-provider';

export interface ScmProviderOptions {
    input?: ScmInputOptions
}

export class ScmRepository implements Disposable {

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange = this.onDidChangeEmitter.event;
    protected fireDidChange(): void {
        this.onDidChangeEmitter.fire(undefined);
    }

    protected readonly toDispose = new DisposableCollection(this.onDidChangeEmitter);

    readonly input: ScmInput;

    constructor(
        readonly provider: ScmProvider,
        protected readonly options: ScmProviderOptions = {}
    ) {
        this.toDispose.pushAll([
            this.provider,
            this.input = new ScmInput(options.input),
            this.input.onDidChange(() => this.fireDidChange())
        ]);
    }

    dispose(): void {
        this.toDispose.dispose();
    }

}
