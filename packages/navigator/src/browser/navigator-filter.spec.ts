// *****************************************************************************
// Copyright (C) 2018 TypeFox and others.
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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
const disableJSDOM = enableJSDOM();

import URI from '@theia/core/lib/common/uri';
import { FileStat } from '@theia/filesystem/lib/common/files';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { FileNavigatorPreferences } from '../common/navigator-preferences';
import { FileNavigatorFilter, FileNavigatorFilterPredicate } from './navigator-filter';

disableJSDOM();

interface Input {
    readonly patterns: { [key: string]: boolean };
    readonly includes: string[];
    readonly excludes: string[];
}

class TestFileNavigatorFilter extends FileNavigatorFilter {
    constructor(
        protected override readonly workspaceService: WorkspaceService,
        filterPredicate: FileNavigatorFilter.Predicate
    ) {
        super({} as FileNavigatorPreferences);
        this.filterPredicate = filterPredicate;
    }

    testFilter(item: { id: string }): boolean {
        return this.filterItem(item);
    }
}

function toFileStatNode(uri: URI): { id: string; uri: URI; fileStat: FileStat } {
    return {
        id: uri.toString(),
        uri,
        fileStat: FileStat.dir(uri.toString())
    };
}

describe('navigator-filter-glob', () => {

    const toItem = (id: string) => ({ id: id.replace(/^\//, '') });
    const itemsToFilter = [
        '/.git/',
        '/.git/a',
        '/.git/b',

        '/a.js',
        '/dist/',

        '/src/dist/',
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
                '/src/foo/a.js',
                '/test/baz/bar/a.js',
                '/.git/'
            ],
            excludes: [
                '/a.js'
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
                '/src/foo/a.ts',
                '/src/foo/a.js'
            ],
            excludes: [
                '/.git/',
                '/a.js'
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
        },
        {
            patterns: {
                'dist': true
            },
            includes: [
                '/src/dist/'
            ],
            excludes: [
                '/dist/'
            ]
        },
        {
            patterns: {
                '*/dist': true
            },
            includes: [
                '/dist/'
            ],
            excludes: [
                '/src/dist/'
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

describe('navigator-filter workspace paths', () => {
    const workspaceRoot = new URI('file:///workspace');
    const workspaceService = sinon.createStubInstance(WorkspaceService);
    workspaceService.getWorkspaceRootUri.returns(workspaceRoot);
    const filter = new TestFileNavigatorFilter(workspaceService, new FileNavigatorFilterPredicate({ dist: true }));

    it('matches files.exclude against workspace-relative paths', () => {
        const rootDist = new URI('file:///workspace/dist');
        const nestedDist = new URI('file:///workspace/src/dist');

        expect(filter.testFilter(toFileStatNode(rootDist))).to.be.false;
        expect(filter.testFilter(toFileStatNode(nestedDist))).to.be.true;
    });
});

function includes<T>(array: T[], item: T, message: string = `Expected ${JSON.stringify(array)} to include ${JSON.stringify(item)}.`): void {
    expect(array).to.deep.include(item, message);
}

function excludes<T>(array: T[], item: T, message: string = `Expected ${JSON.stringify(array)} to not include ${JSON.stringify(item)}.`): void {
    expect(array).to.not.deep.include(item, message);
}
