/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as fs from 'fs';
import * as chokidar from 'chokidar';

declare module 'chokidar' {
    export type FSEvent = 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir';
    export type WatchEvent = FSEvent | 'error' | 'ready' | 'raw';
    export class ChokidarWatcher extends chokidar.FSWatcher {
        on(event: "add", listener: (path: string, stat?: fs.Stats) => void): this;
        once(event: "add", listener: (path: string, stat?: fs.Stats) => void): this;
        on(event: "addDir", listener: (path: string, stat?: fs.Stats) => void): this;
        once(event: "addDir", listener: (path: string, stat?: fs.Stats) => void): this;
        on(event: "change", listener: (path: string, stat?: fs.Stats) => void): this;
        once(event: "change", listener: (path: string, stat?: fs.Stats) => void): this;
        on(event: "unlink", listener: (path: string) => void): this;
        once(event: "unlink", listener: (path: string) => void): this;
        on(event: "unlinkDir", listener: (path: string) => void): this;
        once(event: "unlinkDir", listener: (path: string) => void): this;
        on(event: "error", listener: (error: Error) => void): this;
        once(event: "error", listener: (error: Error) => void): this;
        on(event: "ready", listener: () => void): this;
        once(event: "ready", listener: () => void): this;
        on(event: "raw", listener: (eventType: FSEvent, path: string, details: any) => void): this;
        once(event: "raw", listener: (eventType: FSEvent, path: string, details: any) => void): this;
        on(event: "all", listener: (eventType: FSEvent, path: string) => void): this;
        once(event: "all", listener: (eventType: FSEvent, path: string) => void): this;
    }
    export function watch(paths: string | string[], options?: WatchOptions): ChokidarWatcher;
}
