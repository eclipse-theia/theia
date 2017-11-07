/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import { Event, Disposable } from '@theia/core/lib/common';

export const UserStorageService = Symbol('UserStorageService');

export interface UserStorageService extends Disposable {
    readContents(uri: string): Promise<string>;

    saveContents(uri: string, content: string): Promise<void>;

    onUserStorageChanged: Event<UserStorageChangeEvent>;
}

export interface UserStorageChangeEvent {
    uris: string[];
}
