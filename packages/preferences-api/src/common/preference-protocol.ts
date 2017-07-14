/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { Disposable } from "@theia/core/lib/common";

export const preferencesPath = '/services/preferences';

export const PreferenceServer = Symbol("PreferenceServer")

export interface PreferenceServer extends Disposable {
    setClient(client: PreferenceClient | undefined): void;
    ready(): Promise<void>;
}

export const PREF_INIT = "INIT";

export interface PreferenceClient {
    onDidChangePreference(event: PreferenceChangedEvent): void
}

export interface PreferenceChangedEvent {
    readonly preferenceName: string;
    readonly newValue?: any;
    readonly oldValue?: any;
}
