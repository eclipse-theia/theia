/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from 'inversify';
import { GitRepositoryWatcher } from '../git-repository-watcher';
import { Disposable, Event, Emitter } from '@theia/core';
import { GitStatusChangeEvent } from '../../common/git-watcher';

@injectable()
export class MockRepositoryWatcher implements GitRepositoryWatcher {

    private readonly onStatusChangedEmitter = new Emitter<GitStatusChangeEvent>();
    readonly onStatusChanged: Event<GitStatusChangeEvent> = this.onStatusChangedEmitter.event;

    sync(): Promise<void> {
        return Promise.resolve();
    }

    watch(): Disposable {
        return Disposable.create(() => { /* NOOP */ });
    }

}
