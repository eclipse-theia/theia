/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable } from 'inversify';
import { Event, Emitter } from '@theia/core/lib/common/event';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { debounce } from 'throttle-debounce';

/**
 * Options for the search term debounce.
 */
@injectable()
export class SearchBoxDebounceOptions {

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
@injectable()
export class SearchBoxDebounce implements Disposable {

    protected readonly disposables = new DisposableCollection();
    protected readonly emitter = new Emitter<string | undefined>();
    protected readonly handler: () => void;

    protected state: string | undefined;

    constructor(@inject(SearchBoxDebounceOptions) protected readonly options: SearchBoxDebounceOptions) {
        this.disposables.push(this.emitter);
        this.handler = debounce(this.options.delay, () => this.fireChanged(this.state)).bind(this);
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
