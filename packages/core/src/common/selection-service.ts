/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from 'inversify';
import { Emitter, Event } from '../common/event';

// tslint:disable:no-any

export interface SelectionProvider<T> {
    onSelectionChanged: Event<T | undefined>;
}

@injectable()
export class SelectionService implements SelectionProvider<Object | undefined> {

    private currentSelection: Object | undefined;

    protected readonly onSelectionChangedEmitter = new Emitter<any>();
    readonly onSelectionChanged: Event<any> = this.onSelectionChangedEmitter.event;

    get selection(): Object | undefined {
        return this.currentSelection;
    }

    set selection(selection: Object | undefined) {
        this.currentSelection = selection;
        this.onSelectionChangedEmitter.fire(this.currentSelection);
    }

}
