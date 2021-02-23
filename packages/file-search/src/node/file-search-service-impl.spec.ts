/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { expect } from 'chai';
import * as assert from 'assert';
import * as path from 'path';
import { FileSearchServiceImpl } from './file-search-service-impl';
import { FileUri } from '@theia/core/lib/node';
import { Container, ContainerModule } from '@theia/core/shared/inversify';
import { CancellationTokenSource } from '@theia/core';
import { bindLogger } from '@theia/core/lib/node/logger-backend-module';
import URI from '@theia/core/lib/common/uri';
import { FileSearchService } from '../common/file-search-service';
import { RawProcessFactory } from '@theia/process/lib/node';

/* eslint-disable no-unused-expressions */

const testContainer = new Container();

bindLogger(testContainer.bind.bind(testContainer));
testContainer.bind(RawProcessFactory).toConstantValue(() => {
    throw new Error('should not be used anymore');
});
testContainer.load(new ContainerModule(bind => {
    bind(FileSearchServiceImpl).toSelf().inSingletonScope();
}));

describe('search-service', function (): void {

    this.timeout(10000);

    let service: FileSearchServiceImpl;

    beforeEach(() => {
        service = testContainer.get(FileSearchServiceImpl);
    });

    it('should fuzzy search this spec file', async () => {
        const rootUri = FileUri.create(path.resolve(__dirname, '..')).toString();
        const matches = await service.find('spc', { rootUris: [rootUri] });
        // eslint-disable-next-line deprecation/deprecation
        const expectedFile = FileUri.create(__filename).displayName;
        const testFile = matches.find(e => e.endsWith(expectedFile));
        expect(testFile).to.not.be.undefined;
    });

    it.skip('should respect nested .gitignore', async () => {
        const rootUri = FileUri.create(path.resolve(__dirname, '../../test-resources')).toString();
        const matches = await service.find('foo', { rootUris: [rootUri], fuzzyMatch: false });

        expect(matches.find(match => match.endsWith('subdir1/sub-bar/foo.txt'))).to.be.undefined;
        expect(matches.find(match => match.endsWith('subdir1/sub2/foo.txt'))).to.not.be.undefined;
        expect(matches.find(match => match.endsWith('subdir1/foo.txt'))).to.not.be.undefined;
    });

    it('should cancel searches', async () => {
        const rootUri = FileUri.create(path.resolve(__dirname, '../../../../..')).toString();
        const cancelTokenSource = new CancellationTokenSource();
        cancelTokenSource.cancel();
        const matches = await service.find('foo', { rootUris: [rootUri], fuzzyMatch: false }, cancelTokenSource.token);

        expect(matches).to.be.empty;
    });

    it('should perform file search across all folders in the workspace', async () => {
        const dirA = FileUri.create(path.resolve(__dirname, '../../test-resources/subdir1/sub-bar')).toString();
        const dirB = FileUri.create(path.resolve(__dirname, '../../test-resources/subdir1/sub2')).toString();

        const matches = await service.find('foo', { rootUris: [dirA, dirB] });
        expect(matches).to.not.be.undefined;
        expect(matches.length).to.eq(2);
    });

    describe('search with glob', () => {
        it('should support file searches with globs', async () => {
            const rootUri = FileUri.create(path.resolve(__dirname, '../../test-resources/subdir1/sub2')).toString();

            const matches = await service.find('', { rootUris: [rootUri], includePatterns: ['**/*oo.*'] });
            expect(matches).to.not.be.undefined;
            expect(matches.length).to.eq(1);
        });

        it('should NOT support file searches with globs without the prefixed or trailing star (*)', async () => {
            const rootUri = FileUri.create(path.resolve(__dirname, '../../test-resources/subdir1/sub2')).toString();

            const trailingMatches = await service.find('', { rootUris: [rootUri], includePatterns: ['*oo'] });
            expect(trailingMatches).to.not.be.undefined;
            expect(trailingMatches.length).to.eq(0);

            const prefixedMatches = await service.find('', { rootUris: [rootUri], includePatterns: ['oo*'] });
            expect(prefixedMatches).to.not.be.undefined;
            expect(prefixedMatches.length).to.eq(0);
        });
    });

    describe('search with ignored patterns', () => {
        it('should NOT ignore strings passed through the search options', async () => {
            const rootUri = FileUri.create(path.resolve(__dirname, '../../test-resources/subdir1/sub2')).toString();

            const matches = await service.find('', { rootUris: [rootUri], includePatterns: ['**/*oo.*'], excludePatterns: ['foo'] });
            expect(matches).to.not.be.undefined;
            expect(matches.length).to.eq(1);
        });

        const ignoreGlobsUri = FileUri.create(path.resolve(__dirname, '../../test-resources/subdir1/sub2')).toString();
        it('should ignore globs passed through the search options #1', () => assertIgnoreGlobs({
            rootUris: [ignoreGlobsUri],
            includePatterns: ['**/*oo.*'],
            excludePatterns: ['*fo*']
        }));
        it('should ignore globs passed through the search options #2', () => assertIgnoreGlobs({
            rootOptions: {
                [ignoreGlobsUri]: {
                    includePatterns: ['**/*oo.*'],
                    excludePatterns: ['*fo*']
                }
            }
        }));
        it('should ignore globs passed through the search options #3', () => assertIgnoreGlobs({
            rootOptions: {
                [ignoreGlobsUri]: {
                    includePatterns: ['**/*oo.*']
                }
            },
            excludePatterns: ['*fo*']
        }));
        it('should ignore globs passed through the search options #4', () => assertIgnoreGlobs({
            rootOptions: {
                [ignoreGlobsUri]: {
                    excludePatterns: ['*fo*']
                }
            },
            includePatterns: ['**/*oo.*']
        }));
        it('should ignore globs passed through the search options #5', () => assertIgnoreGlobs({
            rootOptions: {
                [ignoreGlobsUri]: {}
            },
            excludePatterns: ['*fo*'],
            includePatterns: ['**/*oo.*']
        }));

        async function assertIgnoreGlobs(options: FileSearchService.Options): Promise<void> {
            const matches = await service.find('', options);
            expect(matches).to.not.be.undefined;
            expect(matches.length).to.eq(0);
        }
    });

    describe('irrelevant absolute results', () => {
        const rootUri = FileUri.create(path.resolve(__dirname, '../../../..'));

        it('not fuzzy', async () => {
            const searchPattern = rootUri.path.dir.base;
            const matches = await service.find(searchPattern, { rootUris: [rootUri.toString()], fuzzyMatch: false, useGitIgnore: true, limit: 200 });
            for (const match of matches) {
                const relativeUri = rootUri.relative(new URI(match));
                assert.notStrictEqual(relativeUri, undefined);
                const relativeMatch = relativeUri!.toString();
                assert.notStrictEqual(relativeMatch.indexOf(searchPattern), -1, relativeMatch);
            }
        });

        it('fuzzy', async () => {
            const matches = await service.find('shell', { rootUris: [rootUri.toString()], fuzzyMatch: true, useGitIgnore: true, limit: 200 });
            for (const match of matches) {
                const relativeUri = rootUri.relative(new URI(match));
                assert.notStrictEqual(relativeUri, undefined);
                const relativeMatch = relativeUri!.toString();
                let position = 0;
                for (const ch of 'shell') {
                    position = relativeMatch.toLowerCase().indexOf(ch, position);
                    assert.notStrictEqual(position, -1, `character "${ch}" not found in "${relativeMatch}"`);
                }
            }
        });

        it('should not look into .git', async () => {
            const matches = await service.find('master', { rootUris: [rootUri.toString()], fuzzyMatch: false, useGitIgnore: true, limit: 200 });
            // `**/.git/refs/remotes/*/master` files should not be picked up
            assert.deepStrictEqual([], matches);
        });
    });

    describe('search with whitespaces', () => {
        const rootUri = FileUri.create(path.resolve(__dirname, '../../test-resources')).toString();

        it('should support file searches with whitespaces', async () => {
            const matches = await service.find('foo sub', { rootUris: [rootUri], fuzzyMatch: true, useGitIgnore: true, limit: 200 });

            expect(matches).to.be.length(2);
            expect(matches[0].endsWith('subdir1/sub-bar/foo.txt'));
            expect(matches[1].endsWith('subdir1/sub2/foo.txt'));
        });

        it('should support fuzzy file searches with whitespaces', async () => {
            const matchesExact = await service.find('foo sbd2', { rootUris: [rootUri], fuzzyMatch: false, useGitIgnore: true, limit: 200 });
            const matchesFuzzy = await service.find('foo sbd2', { rootUris: [rootUri], fuzzyMatch: true, useGitIgnore: true, limit: 200 });

            expect(matchesExact).to.be.length(0);
            expect(matchesFuzzy).to.be.length(1);
            expect(matchesFuzzy[0].endsWith('subdir1/sub2/foo.txt'));
        });

        it('should support file searches with whitespaces regardless of order', async () => {
            const matchesA = await service.find('foo sub', { rootUris: [rootUri], fuzzyMatch: true, useGitIgnore: true, limit: 200 });
            const matchesB = await service.find('sub foo', { rootUris: [rootUri], fuzzyMatch: true, useGitIgnore: true, limit: 200 });

            expect(matchesA).to.not.be.empty;
            expect(matchesB).to.not.be.empty;
            expect(matchesA.length).to.equal(matchesB.length);

            // Due to ripgrep parallelism we cannot deepEqual the matches since order is not guaranteed.
            expect(matchesA).to.have.members(matchesB);
        });
    });

});
