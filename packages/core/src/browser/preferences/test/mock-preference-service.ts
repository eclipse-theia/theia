/*
 * Copyright (C) 2018 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from 'inversify';
import { PreferenceService, PreferenceChange } from '../';
import { Emitter, Event } from '../../../common';

@injectable()
export class MockPreferenceService implements PreferenceService {
    constructor() { }
    dispose() { }
    get<T>(preferenceName: string): T | undefined;
    get<T>(preferenceName: string, defaultValue: T): T;
    get<T>(preferenceName: string, defaultValue?: T): T | undefined {
        return undefined;
    }
    ready: Promise<void>;
    readonly onPreferenceChanged: Event<PreferenceChange> = new Emitter<PreferenceChange>().event;
}
