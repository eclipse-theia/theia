/*
 * Copyright (C) 2018 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from 'inversify';
import { Disposable, DisposableCollection, Emitter, Event } from '../../common';

@injectable()
export class PreferenceProvider implements Disposable {
    protected readonly onDidPreferencesChangedEmitter = new Emitter<void>();
    readonly onDidPreferencesChanged: Event<void> = this.onDidPreferencesChangedEmitter.event;

    protected readonly toDispose = new DisposableCollection();

    constructor() {
        this.toDispose.push(this.onDidPreferencesChangedEmitter);
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    protected fireOnDidPreferencesChanged(): void {
        this.onDidPreferencesChangedEmitter.fire(undefined);
    }

    getPreferences(): { [p: string]: any } {
        return [];
    }

    setPreference(key: string, value: any): Promise<void> {
        return Promise.resolve();
    }
}
