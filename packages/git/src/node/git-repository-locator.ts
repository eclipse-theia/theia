/*
* Copyright (C) 2017 TypeFox and others.
*
* Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
* You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
*/
import * as fs from 'fs';
import * as Path from 'path';
import { FileUri } from '@theia/core/lib/node/file-uri';
import { Repository } from '../common/model';

const abs: (path: string) => string = require('abs');
const finder: any = require('findit2');

/**
 * Resolves to an array of repositories, recursively discovered from the given root `path`.
 *
 * @param path the FS path of the root to start the discovery.
 */
export async function locateRepositories(path: string): Promise<Repository[]> {
    return new Promise<Repository[]>(async (resolve, reject) => {
        const repositories: Repository[] = [];
        const emitter = finder(abs(path));
        emitter.on('directory', (dir: string, stat: fs.Stats, stop: () => void) => {
            const base = Path.basename(dir);
            if (base === '.git') {
                const localUri = FileUri.create(dir).toString();
                repositories.push({ localUri });
                stop();
            }
        });
        emitter.on('done', () => {
            resolve(repositories);
        });
        emitter.on('error', (error: Error) => {
            reject(error);
        });
    });
}

// function getOrigin(repository, cb) {
//     fs.readFile(repository + '/.git/config', function (err, data) {
//         if (err) return cb(err);
//         var sections = data.toString().split(/^\[/gm);
//         var remote;
//         sections.forEach(function (section, i) {
//             if (section.indexOf('remote "origin"') === 0) {
//                 var matches = section.match(/^[\s]+url = (.+)$/m);
//                 if (matches) {
//                     remote = matches[1].trim();
//                     return false;
//                 }
//             }
//         });
//         cb(undefined, remote);
//     });
// }