/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { Package } from './package';
import { LocalDependencyManager } from './manager';

const verbose = '--verbose';
const sync = '--sync';
const run = '--run';
const dev = '--dev';
const options = [
    verbose, sync, run, dev
];

function testOption(option: string): boolean {
    return process.argv.some(argv => argv.startsWith(option));
}

function getOption(option: string): string | undefined {
    return process.argv.filter(arg =>
        arg.startsWith(option)
    ).map(arg =>
        arg.substr(option.length + 1)
        )[0];
}

function getArgs(index: number): (string | undefined)[] {
    return process.argv.slice(index).filter(arg =>
        options.some(option => arg.startsWith(option)) === false
    )
}

const pck = new Package(process.cwd(), testOption(dev), testOption(verbose));
const manager = new LocalDependencyManager(pck);

const command = process.argv[2];
const args = getArgs(3);
if (command === 'install') {
    manager.install(args[0]);
} else if (command === 'uninstall') {
    manager.uninstall(args[0]);
} else if (command === 'clean') {
    manager.clean(args[0]);
} else if (command === 'update') {
    manager.update(args[0]);
} else if (command === 'sync') {
    manager.sync(args[0]);
} else if (command === 'watch') {
    manager.watch(args[0], testOption(sync), getOption(run));
} else if (command === 'run') {
    const script = args[0];
    if (script) {
        manager.run(script, args[1]);
    } else {
        console.log('A script should be provided, e.g. `ldm run build`');
    }
} else {
    manager.list(getArgs(2)[0]);
}