// *****************************************************************************
// Copyright (C) 2026 Sahil Gupta and others.
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
let disableJSDOM = enableJSDOM();

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import { Disposable, URI } from '@theia/core';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { FileSystemProvider, FileSystemProviderCapabilities } from '../common/files';
import { FileService } from './file-service';

disableJSDOM();

function createMockProvider(caseSensitive: boolean): FileSystemProvider {
    return {
        capabilities: caseSensitive ? FileSystemProviderCapabilities.PathCaseSensitive : 0,
        onDidChangeCapabilities: () => Disposable.NULL,
        onDidChangeFile: () => Disposable.NULL,
        onFileWatchError: () => Disposable.NULL,
        watch: () => Disposable.NULL,
        stat: () => { throw new Error('not implemented'); },
        readdir: () => { throw new Error('not implemented'); },
        readFile: () => { throw new Error('not implemented'); },
        writeFile: () => { throw new Error('not implemented'); },
        delete: () => { throw new Error('not implemented'); },
        mkdir: () => { throw new Error('not implemented'); },
        rename: () => { throw new Error('not implemented'); },
        copy: () => { throw new Error('not implemented'); },
    } as unknown as FileSystemProvider;
}

/** Resolve to the rejection reason of the given promise, or to `undefined` if it fulfills. */
async function rejection(promise: Promise<unknown>): Promise<Error | undefined> {
    try {
        await promise;
        return undefined;
    } catch (error) {
        return error as Error;
    }
}

describe('FileService move/copy validation', () => {
    const sandbox = sinon.createSandbox();
    let fileService: FileService;
    let provider: FileSystemProvider;
    let existsStub: sinon.SinonStub;

    before(() => {
        disableJSDOM = enableJSDOM();
    });

    after(() => {
        disableJSDOM();
    });

    afterEach(() => {
        sandbox.restore();
    });

    /** Create a `FileService` backed by a single mock provider for both source and target. */
    function setup(caseSensitive: boolean = true): void {
        sandbox.restore();
        fileService = new FileService();
        provider = createMockProvider(caseSensitive);
        /* eslint-disable @typescript-eslint/no-explicit-any */
        sandbox.stub(fileService as any, 'withProvider').resolves(provider);
        sandbox.stub(fileService as any, 'withReadProvider').resolves(provider);
        sandbox.stub(fileService as any, 'withWriteProvider').resolves(provider);
        // The error messages name the involved resources through the label provider.
        (fileService as any).labelProvider = { getLongName: (resource: URI) => resource.path.toString() };
        /* eslint-enable @typescript-eslint/no-explicit-any */
        // By default the target does not exist yet, which is the case when pasting a folder into one of its own subfolders.
        existsStub = sandbox.stub(fileService, 'exists').resolves(false);
    }

    function validate(source: string, target: string, mode: 'move' | 'copy'): Promise<unknown> {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (fileService as any).doValidateMoveCopy(provider, new URI(source), provider, new URI(target), mode, false);
    }

    describe('source containing the target', () => {

        it('should reject copying a folder into a subfolder of itself', async () => {
            setup();
            const error = await rejection(validate('file:///a', 'file:///a/b/a', 'copy'));
            expect(error, 'copying a folder into its own subfolder was allowed').to.be.an.instanceOf(Error);
            expect(error!.message).to.contain('is parent of target');
        });

        it('should reject moving a folder into a subfolder of itself', async () => {
            setup();
            const error = await rejection(validate('file:///a', 'file:///a/b', 'move'));
            expect(error, 'moving a folder into its own subfolder was allowed').to.be.an.instanceOf(Error);
            expect(error!.message).to.contain('is parent of target');
        });

        it('should reject a deeply nested target inside the source', async () => {
            setup();
            const error = await rejection(validate('file:///a', 'file:///a/b/c/d/a', 'copy'));
            expect(error, 'copying a folder deep into its own subtree was allowed').to.be.an.instanceOf(Error);
            expect(error!.message).to.contain('is parent of target');
        });

        it('should reject copying a folder into its own subfolder through FileService.copy', async () => {
            setup();
            const error = await rejection(fileService.copy(new URI('file:///a'), new URI('file:///a/b/a'), { fromUserGesture: false }));
            expect(error, 'FileService.copy allowed a copy into the source subtree').to.be.an.instanceOf(Error);
            expect(error!.message).to.contain('is parent of target');
        });

        it('should reject moving a folder into its own subfolder through FileService.move', async () => {
            setup();
            const error = await rejection(fileService.move(new URI('file:///a'), new URI('file:///a/b'), { fromUserGesture: false }));
            expect(error, 'FileService.move allowed a move into the source subtree').to.be.an.instanceOf(Error);
            expect(error!.message).to.contain('is parent of target');
        });

        it('should reject a target inside the source that only differs in case on a case-insensitive provider', async () => {
            setup(false);
            const error = await rejection(validate('file:///a', 'file:///A/b/a', 'copy'));
            expect(error, 'a case-insensitive provider allowed a copy into the source subtree').to.be.an.instanceOf(Error);
            expect(error!.message).to.contain('is parent of target');
        });
    });

    describe('the same resource', () => {

        it('should reject copying a resource onto itself', async () => {
            setup();
            const error = await rejection(validate('file:///a/b', 'file:///a/b', 'copy'));
            expect(error, 'copying a resource onto itself was allowed').to.be.an.instanceOf(Error);
            expect(error!.message).to.contain('is parent of target');
        });

        it('should reject moving a resource onto itself', async () => {
            setup();
            const error = await rejection(validate('file:///a/b', 'file:///a/b', 'move'));
            expect(error, 'moving a resource onto itself was allowed').to.be.an.instanceOf(Error);
            expect(error!.message).to.contain('is parent of target');
        });
    });

    describe('unrelated and adjacent targets', () => {

        it('should accept an unrelated target', async () => {
            setup();
            const result = await validate('file:///a', 'file:///c/a', 'copy');
            expect(result).to.deep.equal({ exists: false, isSameResourceWithDifferentPathCase: false });
        });

        it('should accept a target whose path merely shares a prefix with the source', async () => {
            setup();
            const result = await validate('file:///a', 'file:///ab/a', 'copy');
            expect(result).to.deep.equal({ exists: false, isSameResourceWithDifferentPathCase: false });
        });

        it('should accept a target in a different file system', async () => {
            setup();
            const result = await validate('file:///a', 'memory:///a/b/a', 'copy');
            expect(result).to.deep.equal({ exists: false, isSameResourceWithDifferentPathCase: false });
        });
    });

    describe('the target containing the source', () => {

        it('should reject moving a resource onto the existing folder that contains it', async () => {
            setup();
            existsStub.resolves(true);
            const error = await rejection(validate('file:///a/b', 'file:///a', 'move'));
            expect(error, 'moving a resource onto its own parent folder was allowed').to.be.an.instanceOf(Error);
            expect(error!.message).to.contain('would replace the folder it is contained in');
        });
    });

    describe('case-only renames on a case-insensitive provider', () => {

        it('should accept a case-only rename', async () => {
            setup(false);
            const result = await validate('file:///a/Foo', 'file:///a/foo', 'move');
            expect(result).to.deep.equal({ exists: false, isSameResourceWithDifferentPathCase: true });
        });

        it('should accept a case-only rename of a nested resource', async () => {
            setup(false);
            const result = await validate('file:///a/b/Foo.ts', 'file:///a/b/foo.ts', 'move');
            expect(result).to.deep.equal({ exists: false, isSameResourceWithDifferentPathCase: true });
        });

        it('should accept a case-only rename even when the target is reported as existing', async () => {
            setup(false);
            existsStub.resolves(true);
            const result = await validate('file:///a/Foo', 'file:///a/foo', 'move');
            expect(result).to.deep.equal({ exists: true, isSameResourceWithDifferentPathCase: true });
        });

        it('should reject a case-only copy', async () => {
            setup(false);
            const error = await rejection(validate('file:///a/Foo', 'file:///a/foo', 'copy'));
            expect(error, 'a case-only copy was allowed').to.be.an.instanceOf(Error);
            expect(error!.message).to.contain('is parent of target');
        });

        it('should accept a case-only rename on a case-sensitive provider as a distinct resource', async () => {
            setup(true);
            const result = await validate('file:///a/Foo', 'file:///a/foo', 'move');
            expect(result).to.deep.equal({ exists: false, isSameResourceWithDifferentPathCase: false });
        });
    });
});
