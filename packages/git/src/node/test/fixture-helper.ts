/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as fs from 'fs-extra';
import * as path from 'path';

const sync = require('klaw-sync');
type Entry = { path: string };

const fixturesPath = path.join(__dirname, '..', '..', '..', 'test-resources', 'fixtures');

/**
 * Creates a new Git fixture repository for testing. Returns with the path to the test repository.
 *
 * @param repositoryName the name of the Git repository from `test-resources/fixtures` to setup for testing.
 * @param destinationPath the destination FS path where the repository will be created.
 */
export function setupRepository(repositoryName: string, destinationRoot: string): string {
    const repositoryPath = path.join(fixturesPath, repositoryName);
    if (!fs.existsSync(repositoryPath)) {
        throw new Error(`No fixture repository exists under '${fixturesPath}' with name '${repositoryName}'.`);
    }

    const destinationPath = path.join(destinationRoot, repositoryName);
    fs.mkdirpSync(destinationPath);
    fs.copySync(repositoryPath, destinationPath);
    fs.renameSync(
        path.join(destinationPath, '_git'),
        path.join(destinationPath, '.git')
    );

    const ignoreHiddenFiles = (item: Entry) => {
        const basename = path.basename(item.path);
        return basename === '.' || basename[0] !== '.';
    };

    const entries: ReadonlyArray<Entry> = sync(destinationPath);
    const visiblePaths = entries.filter(ignoreHiddenFiles);
    const subModules = visiblePaths.filter(
        entry => path.basename(entry.path) === '_git'
    );

    subModules.forEach(entry => {
        const directory = path.dirname(entry.path);
        const newPath = path.join(directory, '.git');
        fs.renameSync(entry.path, newPath);
    });

    return destinationPath;
}
