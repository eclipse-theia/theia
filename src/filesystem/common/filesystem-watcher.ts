/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from "inversify";
import { Emitter, Event } from '../../application/common';
import { FileSystemClient, FileChangesEvent } from './filesystem';

@injectable()
export class FileSystemWatcher {

    getFileSystemClient(): FileSystemClient {
        const emitter = this.onFileChangesEmitter
        return {
            onFileChanges(event: FileChangesEvent) {
                emitter.fire(event)
            }
        }
    }

    private onFileChangesEmitter = new Emitter<FileChangesEvent>();

    get onFileChanges(): Event<FileChangesEvent> {
        return this.onFileChangesEmitter.event;
    }

}