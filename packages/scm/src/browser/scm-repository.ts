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

// tslint:disable:no-any

import { Disposable, DisposableCollection, Emitter } from '@theia/core/lib/common';
import { ScmInput, ScmInputOptions } from './scm-input';
import { ScmProvider, ScmResource } from './scm-provider';

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
            this.provider.onDidChange(() => this.updateResources()),
            this.input = new ScmInput(options.input),
            this.input.onDidChange(() => this.fireDidChange())
        ]);
        this.updateResources();
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    // TODO replace by TreeModel
    protected readonly _resources: ScmResource[] = [];
    get resources(): ScmResource[] {
        return this._resources;
    }
    protected updateResources(): void {
        this._resources.length = 0;
        for (const group of this.provider.groups) {
            this._resources.push(...group.resources);
        }
        this.updateSelection();
    }

    protected selectedIndex: number = -1;
    get selectedResource(): ScmResource | undefined {
        return this._resources[this.selectedIndex];
    }
    set selectedResource(selectedResource: ScmResource | undefined) {
        this.selectedIndex = selectedResource ? this._resources.indexOf(selectedResource) : -1;
        this.fireDidChange();
    }
    protected updateSelection(): void {
        this.selectedResource = this.selectedResource;
    }

    selectNextResource(): ScmResource | undefined {
        const lastIndex = this._resources.length - 1;
        if (this.selectedIndex >= 0 && this.selectedIndex < lastIndex) {
            this.selectedIndex++;
            this.fireDidChange();
        } else if (this._resources.length && (this.selectedIndex === -1 || this.selectedIndex === lastIndex)) {
            this.selectedIndex = 0;
            this.fireDidChange();
        }
        return this.selectedResource;
    }

    selectPreviousResource(): ScmResource | undefined {
        if (this.selectedIndex > 0) {
            this.selectedIndex--;
            this.fireDidChange();
        } else if (this.selectedIndex === 0) {
            this.selectedIndex = this._resources.length - 1;
            this.fireDidChange();
        }
        return this.selectedResource;
    }

}
