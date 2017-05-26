/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as cpx from "cpx";

export interface Watcher {
    watch(sync?: boolean): void;
    sync(): void;
}

export namespace Watcher {
    export function compose(watchers: Watcher[]): Watcher {
        return {
            sync: () => watchers.forEach(w => w.sync()),
            watch: (shouldSync: boolean) => watchers.forEach(w => w.watch(shouldSync))
        }
    }
}

export class FileWatcherProvider {

    constructor(
        public verbose: boolean
    ) { }

    get(source: string, dest: string): Watcher {
        const watcher = new cpx.Cpx(source, dest);
        watcher.on("watch-ready", e => console.log('Watch directory:', watcher.base));
        watcher.on("copy", e => this.logInfo('Copied:', e.srcPath, '-->', e.dstPath));
        watcher.on("remove", e => this.logInfo('Removed:', e.path));
        watcher.on("watch-error", err => console.error(err.message));
        const sync = () => {
            console.log('Sync:', watcher.src2dst(watcher.source));
            try {
                watcher.cleanSync();
                watcher.copySync();
            } catch (err) {
                console.error('Failed to sync:', err.message);
            }
        }
        const watch = (shouldSync?: boolean) => {
            if (shouldSync) {
                sync();
            }
            watcher.watch();
        }
        return { sync, watch };
    }

    logInfo(message: string, ...optionalParams: any[]) {
        if (this.verbose) {
            console.log(new Date().toLocaleString() + ': ' + message, ...optionalParams);
        }
    }

}