/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { LocalDependencyManager } from './manager';

const verbose = '--verbose';
const options = [
    verbose
];

function getPattern(index: number): string | undefined {
    return process.argv.slice(index).find(arg =>
        options.indexOf(arg) === -1
    )
}

const manager = new LocalDependencyManager();
manager.verbose = process.argv.some(argv => argv === verbose);

const command = process.argv[2];
if (command === 'clean') {
    manager.clean(getPattern(3));
} else if (command === 'update') {
    manager.update(getPattern(3));
} else if (command === 'watch') {
    manager.watch(getPattern(3));
} else {
    manager.list(getPattern(2));
}
