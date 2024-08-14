// *****************************************************************************
// Copyright (C) 2024 Toro Cloud Pty Ltd and others.
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

import { Disposable, Emitter, URI } from '@theia/core';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { FileChangesEvent, FileChangeType, FileStatWithMetadata } from '../common/files';
import { FileResource } from './file-resource';
import { FileService } from './file-service';

disableJSDOM();

describe.only('file-resource', () => {
    const sandbox = sinon.createSandbox();
    const mockEmitter = new Emitter();
    const mockOnChangeEmitter = new Emitter<FileChangesEvent>();
    const mockFileService = new FileService();

    before(() => {
        disableJSDOM = enableJSDOM();
    });

    beforeEach(() => {
        sandbox.restore();

        sandbox.stub(mockFileService, 'onDidFilesChange').get(() =>
            mockOnChangeEmitter.event
        );
        sandbox.stub(mockFileService, 'onDidRunOperation').returns(Disposable.NULL);
        sandbox.stub(mockFileService, 'watch').get(() =>
            mockEmitter.event
        );
        sandbox.stub(mockFileService, 'onDidChangeFileSystemProviderCapabilities').get(() =>
            mockEmitter.event
        );
        sandbox.stub(mockFileService, 'onDidChangeFileSystemProviderReadOnlyMessage').get(() =>
            mockEmitter.event
        );
    });

    after(() => {
        disableJSDOM();
    });

    it('should save contents and not trigger change event', async () => {
        const resource = new FileResource(new URI('file://test/file.txt'),
            mockFileService, { readOnly: false, shouldOpenAsText: () => Promise.resolve(true), shouldOverwrite: () => Promise.resolve(true) });

        const onChangeSpy = sandbox.spy();
        resource.onDidChangeContents(onChangeSpy);

        const deferred = new Deferred<FileStatWithMetadata & { encoding: string }>();

        sandbox.stub(mockFileService, 'write')
            .callsFake(() =>
                deferred.promise
            );

        sandbox.stub(mockFileService, 'resolve')
            .resolves({
                mtime: 1,
                ctime: 0,
                size: 0,
                etag: '',
                isFile: true,
                isDirectory: false,
                isSymbolicLink: false,
                isReadonly: false,
                name: 'file.txt',
                resource: new URI('file://test/file.txt')
            });

        resource.saveContents!('test');

        await new Promise(resolve => setTimeout(resolve, 0));

        mockOnChangeEmitter.fire(new FileChangesEvent(
            [{
                resource: new URI('file://test/file.txt'),
                type: FileChangeType.UPDATED
            }]
        ));

        await new Promise(resolve => setImmediate(resolve));

        expect(onChangeSpy.called).to.be.false;

        deferred.resolve({
            mtime: 0,
            ctime: 0,
            size: 0,
            etag: '',
            encoding: 'utf-8',
            isFile: true,
            isDirectory: false,
            isSymbolicLink: false,
            isReadonly: false,
            name: 'file.txt',
            resource: new URI('file://test/file.txt')
        });

        await new Promise(resolve => setImmediate(resolve));

        expect(resource.version).to.deep.equal({ etag: '', mtime: 0, encoding: 'utf-8' });
    });

    it('should save content changes and not trigger change event', async () => {
        sandbox.stub(mockFileService, 'hasCapability').returns(true);

        const resource = new FileResource(new URI('file://test/file.txt'),
            mockFileService, { readOnly: false, shouldOpenAsText: () => Promise.resolve(true), shouldOverwrite: () => Promise.resolve(true) });

        const onChangeSpy = sandbox.spy();
        resource.onDidChangeContents(onChangeSpy);

        sandbox.stub(mockFileService, 'read')
            .resolves({
                mtime: 1,
                ctime: 0,
                size: 0,
                etag: '',
                name: 'file.txt',
                resource: new URI('file://test/file.txt'),
                value: 'test',
                encoding: 'utf-8'
            });

        await resource.readContents!();

        const deferred = new Deferred<FileStatWithMetadata & { encoding: string }>();

        sandbox.stub(mockFileService, 'update')
            .callsFake(() =>
                deferred.promise
            );

        sandbox.stub(mockFileService, 'resolve')
            .resolves({
                mtime: 1,
                ctime: 0,
                size: 0,
                etag: '',
                isFile: true,
                isDirectory: false,
                isSymbolicLink: false,
                isReadonly: false,
                name: 'file.txt',
                resource: new URI('file://test/file.txt')
            });

        resource.saveContentChanges!([{
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
            rangeLength: 0,
            text: 'test'
        }]);

        await new Promise(resolve => setTimeout(resolve, 0));

        mockOnChangeEmitter.fire(new FileChangesEvent(
            [{
                resource: new URI('file://test/file.txt'),
                type: FileChangeType.UPDATED
            }]
        ));

        await new Promise(resolve => setImmediate(resolve));

        expect(onChangeSpy.called).to.be.false;

        deferred.resolve({
            mtime: 0,
            ctime: 0,
            size: 0,
            etag: '',
            encoding: 'utf-8',
            isFile: true,
            isDirectory: false,
            isSymbolicLink: false,
            isReadonly: false,
            name: 'file.txt',
            resource: new URI('file://test/file.txt')
        });

        await new Promise(resolve => setImmediate(resolve));

        expect(resource.version).to.deep.equal({ etag: '', mtime: 0, encoding: 'utf-8' });
    });

    it('should trigger change event if file is updated and not in sync', async () => {
        const resource = new FileResource(new URI('file://test/file.txt'),
            mockFileService, { readOnly: false, shouldOpenAsText: () => Promise.resolve(true), shouldOverwrite: () => Promise.resolve(true) });

        const onChangeSpy = sandbox.spy();
        resource.onDidChangeContents(onChangeSpy);

        sandbox.stub(mockFileService, 'read')
            .resolves({
                mtime: 1,
                ctime: 0,
                size: 0,
                etag: '',
                name: 'file.txt',
                resource: new URI('file://test/file.txt'),
                value: 'test',
                encoding: 'utf-8'
            });

        await resource.readContents!();

        sandbox.stub(mockFileService, 'resolve')
            .resolves({
                mtime: 2,
                ctime: 0,
                size: 0,
                etag: '',
                isFile: true,
                isDirectory: false,
                isSymbolicLink: false,
                isReadonly: false,
                name: 'file.txt',
                resource: new URI('file://test/file.txt')
            });

        mockOnChangeEmitter.fire(new FileChangesEvent(
            [{
                resource: new URI('file://test/file.txt'),
                type: FileChangeType.UPDATED
            }]
        ));

        await new Promise(resolve => setImmediate(resolve));

        expect(onChangeSpy.called).to.be.true;
    });
});
