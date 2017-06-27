/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */


// FIXME REMOVE???

import { injectable } from 'inversify';
import { Emitter, Event } from '../../application/common';
import { IPreferenceClient } from './preference-service';
import { PreferenceChangedEvent } from './preference-event'

@injectable()
export class PreferenceWatcher {

    getPreferenceClient(): IPreferenceClient {
        const emitter = this.onPrefChangedEmitter
        return {
            onDidChangePreference(event: PreferenceChangedEvent) {
                emitter.fire(event)
            }
        }
    }

    private onPrefChangedEmitter = new Emitter<PreferenceChangedEvent>();

    get onPrefChanged(): Event<PreferenceChangedEvent> {
        return this.onPrefChangedEmitter.event;
    }

}