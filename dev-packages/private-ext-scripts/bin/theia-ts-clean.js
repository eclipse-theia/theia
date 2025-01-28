#!/usr/bin/env node

// *****************************************************************************
// Copyright (C) 2021 Ericsson and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

// @ts-check

const _glob = require('glob');
const debug = require('debug')('ts-clean');
const fs = require('fs');
const parcelWatcher = require('@parcel/watcher');
const path = require('path');
const util = require('util');
const yargs = require('yargs');

const glob = util.promisify(_glob);

tsClean().catch(error => {
    console.error(error);
    process.exit(1);
});

async function tsClean() {
    yargs
        .command(
            '$0 [globs..]',
            'cleanup TypeScript output',
            cmd => cmd
                .option('verbose', {
                    description: 'print what\'s going on',
                    boolean: true,
                    default: false,
                })
                .option('dry', {
                    description: 'only display the files that would be deleted',
                    boolean: true,
                    default: false,
                })
                .option('watch', {
                    description: 'run the cleanup in watch mode',
                    alias: 'w',
                    boolean: true,
                    default: false,
                })
                .positional('globs', {
                    array: true,
                    default: [process.cwd()]
                }),
            async ({ dry, globs, verbose, watch }) => {
                if (dry || verbose) {
                    debug.enabled = true;
                }
                await Promise.all(globs.map(async pattern => {
                    if (typeof pattern !== 'string') {
                        return;
                    }
                    const roots = await glob(pattern, {
                        absolute: true,
                    });
                    await Promise.all(roots.map(async root => {
                        const stat = await fs.promises.stat(root);
                        if (!stat.isDirectory()) {
                            debug(`"${root}" is not a directory, skipping...`);
                            return;
                        }
                        const tsconfigPath = path.resolve(root, 'tsconfig.json');
                        if (!await exists(tsconfigPath)) {
                            debug(`"${root}" is not a TypeScript package, skipping...`);
                            return;
                        }
                        const {
                            compilerOptions: {
                                outDir = undefined,
                                rootDir = undefined,
                            } = {},
                        } = await fs.promises.readFile(tsconfigPath, 'utf8').then(JSON.parse);
                        if (typeof outDir !== 'string' || typeof rootDir !== 'string') {
                            debug(`"${tsconfigPath}" doesn't look like a compilation configuration, skipping...`);
                            return;
                        }
                        const src = path.resolve(root, rootDir);
                        const dst = path.resolve(root, outDir);
                        await watch
                            ? tsCleanWatch(src, dst, dry)
                            : tsCleanRun(src, dst, dry);
                    }));
                }));
            }
        )
        .fail((msg, err, cli) => {
            process.exitCode = 1;
            if (err) {
                // One of the handlers threw an error:
                console.error(err);
            } else {
                // Yargs detected a problem with commands and/or arguments while parsing:
                cli.showHelp();
                console.error(msg);
            }
        })
        .parse();
}

/**
 * @param {string} src
 * @param {string} dst
 * @param {boolean} dry
 */
async function tsCleanWatch(src, dst, dry) {
    await tsCleanRun(src, dst, dry);
    await parcelWatcher.subscribe(src, async (_err, events) => {
        for (const event of events) {
            let absolute;
            if (event.type === 'delete') {
                absolute = event.path;
            } else {
                continue;
            }
            console.log('Source removed:', absolute);
            const relative = path.relative(src, absolute);
            // Absolute path of the expected generated files, without the original ts(x) extension.
            const base = path.resolve(dst, relative).replace(/\.(tsx?)$/i, '');
            await Promise.all(generatedFilesFromBase(base).map(async file => {
                debug('delete', file);
                if (!dry && await exists(file)) {
                    await fs.promises.unlink(file).catch(debug);
                }
            }));
        }
    });
}

/**
 * @param {string} src
 * @param {string} dst
 * @param {boolean} dry
 */
async function tsCleanRun(src, dst, dry) {
    /**
     * Generated files relative to `dst`.
     */
    const files = await glob('**/*.{d.ts,d.ts.map,js,js.map}', {
        absolute: false,
        cwd: dst,
    });
    /**
     * Key is the path without extension (base) relative to `dst`.
     * Value is the list of found generated files (absolute path).
     * @type {Map<string, string[]>}
     */
    const bases = new Map();
    for (const file of files) {
        const parse = path.parse(file);
        const base = path.join(parse.dir, removeExtension(parse.base));
        let generated = bases.get(base);
        if (!generated) {
            bases.set(base, generated = []);
        }
        generated.push(path.resolve(dst, file));
    }
    await Promise.all(Array.from(bases.entries(), async ([base, generated]) => {
        if (await exists(src, `${base}.ts`) || await exists(src, `${base}.tsx`)) {
            return;
        }
        console.log('Missing source:', path.resolve(src, `${base}.ts(x)`));
        await Promise.all(generated.map(async file => {
            debug('delete', file);
            if (!dry) {
                await fs.promises.unlink(file).catch(debug);
            }
        }));
    }));
}

/**
 * @param {string[]} parts
 */
function generatedFilesFromBase(...parts) {
    const base = path.resolve(...parts);
    return [
        `${base}.d.ts`,
        `${base}.d.ts.map`,
        `${base}.js`,
        `${base}.js.map`,
    ];
}

/**
 * Removes the extension of files ending with:
 * .d.ts, .d.ts.map, .js, .js.map, .ts, .tsx
 * @param {string} base
 */
function removeExtension(base) {
    return base.replace(/\.(d\.ts(\.map)?|js(\.map)?|tsx?)$/i, '');
}

/**
 * @param {string[]} parts
 */
async function exists(...parts) {
    return fs.promises.access(path.resolve(...parts), fs.constants.F_OK)
        .then(ok => true, error => false);
}
