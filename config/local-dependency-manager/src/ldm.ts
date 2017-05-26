/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { Package } from "./package";
import { FileWatcherProvider } from './watcher';
import { LocalDependencyManager } from './manager';

const verbose = '--verbose';
const sync = '--sync';
const options = [
    verbose, sync
];

function getPattern(index: number): string | undefined {
    return process.argv.slice(index).find(arg =>
        options.indexOf(arg) === -1
    )
}

function testOption(option: string): boolean {
    return process.argv.some(argv => argv === option);
}

const pck = new Package(process.cwd())
const fileWatcherProvider = new FileWatcherProvider(testOption(verbose));
const manager = new LocalDependencyManager(pck, fileWatcherProvider);

const command = process.argv[2];
if (command === 'clean') {
    manager.clean(getPattern(3));
} else if (command === 'update') {
    manager.update(getPattern(3));
} else if (command === 'sync') {
    manager.sync(getPattern(3));
} else if (command === 'watch') {
    manager.watch(getPattern(3), testOption(sync));
} else {
    manager.list(getPattern(2));
}
