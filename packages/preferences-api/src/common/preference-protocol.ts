/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { JsonRpcServer } from "@theia/core";

export const preferencesPath = '/services/preferences';

export const PreferenceServer = Symbol("PreferenceServer");
export interface PreferenceServer extends JsonRpcServer<PreferenceClient> {
}

export interface PreferenceClient {
    onDidChangePreference(event: PreferenceChangedEvent): void
}

export interface PreferenceChangedEvent {
    changes: PreferenceChange[]
}

export interface PreferenceChange {
    readonly preferenceName: string;
    readonly newValue?: any;
    readonly oldValue?: any;
}