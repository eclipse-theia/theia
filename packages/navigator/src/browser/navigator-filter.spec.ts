/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License'); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
const disableJSDOM = enableJSDOM();

import { expect } from 'chai';
import { FileNavigatorFilterPredicate } from './navigator-filter';

disableJSDOM();

interface Input {
    readonly patterns: { [key: string]: boolean };
    readonly includes: string[];
    readonly excludes: string[];
}

describe('navigator-filter-glob', () => {

    const pathPrefix = 'file:///some/path/to';
    const toItem = (id: string) => ({ id: `${pathPrefix}${id}` });
    const itemsToFilter = [
        '/.git/',
        '/.git/a',
        '/.git/b',

        '/src/foo/',
        '/src/foo/a.js',
        '/src/foo/b.js',
        '/src/foo/a.ts',
        '/src/foo/b.ts',

        '/src/foo/test/bar/a.js',
        '/src/foo/test/bar/b.js',

        '/test/baz/bar/a.js',
        '/test/baz/bar/b.js'
    ].map(toItem);

    ([
        {
            patterns: {
                '**/.git/**': true
            },
            includes: [
                '/src/foo/'
            ],
            excludes: [
                '/.git/',
                '/.git/a',
                '/.git/b'
            ]
        },
        {
            patterns: {
                '*.js': true
            },
            includes: [
                '/src/foo/a.ts',
                '/.git/'
            ],
            excludes: [
                '/src/foo/a.js',
                '/test/baz/bar/a.js'
            ]
        },
        {
            patterns: {
                '**/test/bar/**': true
            },
            includes: [
                '/test/baz/bar/a.js',
                '/test/baz/bar/b.js',
                '/.git/'
            ],
            excludes: [
                '/src/foo/test/bar/a.js',
                '/src/foo/test/bar/b.js'
            ]
        },
        {
            patterns: {
                '*.js': true,
                '**/.git/**': true
            },
            includes: [
                '/src/foo/a.ts'
            ],
            excludes: [
                '/.git/',
                '/src/foo/a.js',
                '/test/baz/bar/a.js'
            ]
        },
        {
            patterns: {
                '*.js': false,
                '**/.git/**': false
            },
            includes: [
                '/.git/',
                '/.git/a',
                '/.git/b',
                '/src/foo/',
                '/src/foo/a.js',
                '/src/foo/b.js',
                '/src/foo/a.ts',
                '/src/foo/b.ts',
                '/src/foo/test/bar/a.js',
                '/src/foo/test/bar/b.js',
                '/test/baz/bar/a.js',
                '/test/baz/bar/b.js'
            ],
            excludes: [

            ]
        }
    ] as Input[]).forEach((test, index) => {
        it(`${index < 10 ? `0${index + 1}` : `${index + 1}`} glob-filter: (${Object.keys(test.patterns).map(key => `${key} [${test.patterns[key]}]`).join(', ')}) `, () => {
            const filter = new FileNavigatorFilterPredicate(test.patterns);
            const result = itemsToFilter.filter(filter.filter.bind(filter));
            test.includes.map(toItem).forEach(item => includes(result, item));
            test.excludes.map(toItem).forEach(item => excludes(result, item));
        });
    });

});

function includes<T>(array: T[], item: T, message: string = `Expected ${JSON.stringify(array)} to include ${JSON.stringify(item)}.`) {
    expect(array).to.deep.include(item, message);
}

function excludes<T>(array: T[], item: T, message: string = `Expected ${JSON.stringify(array)} to not include ${JSON.stringify(item)}.`) {
    expect(array).to.not.deep.include(item, message);
}
