/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

import { Event, Emitter } from '../../common/event';
import { Disposable, DisposableCollection } from '../../common/disposable';

import debounce = require('lodash.debounce');

/**
 * Options for the search term debounce.
 */
export interface SearchBoxDebounceOptions {

    /**
     * The delay (in milliseconds) before the debounce notifies clients about its content change.
     */
    readonly delay: number;

}

export namespace SearchBoxDebounceOptions {

    /**
     * The default debounce option.
     */
    export const DEFAULT: SearchBoxDebounceOptions = {
        delay: 200
    };

}

/**
 * It notifies the clients, once if the underlying search term has changed after a given amount of delay.
 */
export class SearchBoxDebounce implements Disposable {

    protected readonly disposables = new DisposableCollection();
    protected readonly emitter = new Emitter<string | undefined>();
    protected readonly handler: () => void;

    protected state: string | undefined;

    constructor(protected readonly options: SearchBoxDebounceOptions) {
        this.disposables.push(this.emitter);
        this.handler = debounce(() => this.fireChanged(this.state), this.options.delay).bind(this);
    }

    append(input: string | undefined): string | undefined {
        if (input === undefined) {
            this.reset();
            return undefined;
        }
        if (this.state === undefined) {
            this.state = input;
        } else {
            if (input === '\b') {
                this.state = this.state.length === 1 ? '' : this.state.substr(0, this.state.length - 1);
            } else {
                this.state += input;
            }
        }
        this.handler();
        return this.state;
    }

    get onChanged(): Event<string | undefined> {
        return this.emitter.event;
    }

    dispose(): void {
        this.disposables.dispose();
    }

    protected fireChanged(value: string | undefined) {
        this.emitter.fire(value);
    }

    protected reset() {
        this.state = undefined;
        this.fireChanged(undefined);
    }

}
