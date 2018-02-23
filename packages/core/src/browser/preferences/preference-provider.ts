/*
 * Copyright (C) 2018 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { Disposable, Event } from '../../common';

export const PreferenceProvider = Symbol('PreferenceProvider');

export interface PreferenceProvider extends Disposable {
    getPreferences(): { [key: string]: any };
    readonly onDidPreferencesChanged: Event<void>;
}
