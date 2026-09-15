// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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

import { expect } from 'chai';
import { URI } from '@theia/core';
import { MultiDiffEditorUri, MultiDiffEditorUriData } from './multi-diff-editor-uri';

describe('MultiDiffEditorUri', () => {

    const sampleData: MultiDiffEditorUriData = {
        title: 'Test Changes',
        resources: [
            {
                originalUri: new URI('file:///path/to/original/file1.ts'),
                modifiedUri: new URI('file:///path/to/modified/file1.ts')
            },
            {
                originalUri: new URI('file:///path/to/original/file2.ts'),
                modifiedUri: new URI('file:///path/to/modified/file2.ts')
            }
        ]
    };

    describe('encode', () => {

        it('should create a URI with the multi-diff-editor scheme', () => {
            const uri = MultiDiffEditorUri.encode(sampleData);
            expect(uri.scheme).to.equal('multi-diff-editor');
        });

        it('should encode resources in the query', () => {
            const uri = MultiDiffEditorUri.encode(sampleData);
            const parsed = JSON.parse(uri.query);
            expect(parsed.title).to.equal('Test Changes');
            expect(parsed.resources).to.have.length(2);
        });

        it('should be deterministic for the same data', () => {
            const uri1 = MultiDiffEditorUri.encode(sampleData);
            const uri2 = MultiDiffEditorUri.encode(sampleData);
            expect(uri1.toString()).to.equal(uri2.toString());
        });

        it('should produce different URIs for different data', () => {
            const uri1 = MultiDiffEditorUri.encode(sampleData);
            const uri2 = MultiDiffEditorUri.encode({
                ...sampleData,
                title: 'Different Title'
            });
            expect(uri1.toString()).to.not.equal(uri2.toString());
        });
    });

    describe('decode', () => {

        it('should decode an encoded URI back to the original data', () => {
            const uri = MultiDiffEditorUri.encode(sampleData);
            const decoded = MultiDiffEditorUri.decode(uri);
            expect(decoded.title).to.equal(sampleData.title);
            expect(decoded.resources).to.have.length(2);
            expect(decoded.resources[0].originalUri.toString()).to.equal(sampleData.resources[0].originalUri.toString());
            expect(decoded.resources[0].modifiedUri.toString()).to.equal(sampleData.resources[0].modifiedUri.toString());
            expect(decoded.resources[1].originalUri.toString()).to.equal(sampleData.resources[1].originalUri.toString());
            expect(decoded.resources[1].modifiedUri.toString()).to.equal(sampleData.resources[1].modifiedUri.toString());
        });

        it('should throw for URIs with wrong scheme', () => {
            const wrongUri = new URI('file:///some/path');
            expect(() => MultiDiffEditorUri.decode(wrongUri)).to.throw('must have scheme multi-diff-editor');
        });

        it('should throw for URIs whose query is not valid JSON', () => {
            const malformedUri = new URI().withScheme('multi-diff-editor').withQuery('not-json');
            expect(() => MultiDiffEditorUri.decode(malformedUri)).to.throw(/is not a valid URI for scheme multi-diff-editor/);
        });

        it('should throw when the parsed payload is missing a title', () => {
            const uri = new URI().withScheme('multi-diff-editor').withQuery(JSON.stringify({ resources: [] }));
            expect(() => MultiDiffEditorUri.decode(uri)).to.throw(/is not a valid URI for scheme multi-diff-editor/);
        });

        it('should throw when the parsed payload is missing resources', () => {
            const uri = new URI().withScheme('multi-diff-editor').withQuery(JSON.stringify({ title: 'x' }));
            expect(() => MultiDiffEditorUri.decode(uri)).to.throw(/is not a valid URI for scheme multi-diff-editor/);
        });

        it('should throw when a resource entry is not a string pair', () => {
            const uri = new URI().withScheme('multi-diff-editor').withQuery(JSON.stringify({
                title: 'x',
                resources: [['only-one']]
            }));
            expect(() => MultiDiffEditorUri.decode(uri)).to.throw(/is not a valid URI for scheme multi-diff-editor/);
        });

        it('should throw when a resource entry contains non-string values', () => {
            const uri = new URI().withScheme('multi-diff-editor').withQuery(JSON.stringify({
                title: 'x',
                resources: [[123, 456]]
            }));
            expect(() => MultiDiffEditorUri.decode(uri)).to.throw(/is not a valid URI for scheme multi-diff-editor/);
        });

        it('should throw when the payload is a primitive value', () => {
            const uri = new URI().withScheme('multi-diff-editor').withQuery(JSON.stringify('not-an-object'));
            expect(() => MultiDiffEditorUri.decode(uri)).to.throw(/is not a valid URI for scheme multi-diff-editor/);
        });
    });

    describe('isMultiDiffEditorUri', () => {

        it('should return true for multi-diff-editor URIs', () => {
            const uri = MultiDiffEditorUri.encode(sampleData);
            expect(MultiDiffEditorUri.isMultiDiffEditorUri(uri)).to.be.true;
        });

        it('should return false for other URIs', () => {
            const uri = new URI('file:///some/path');
            expect(MultiDiffEditorUri.isMultiDiffEditorUri(uri)).to.be.false;
        });
    });

    describe('roundtrip', () => {

        it('should handle empty resources list', () => {
            const data: MultiDiffEditorUriData = {
                title: 'Empty',
                resources: []
            };
            const uri = MultiDiffEditorUri.encode(data);
            const decoded = MultiDiffEditorUri.decode(uri);
            expect(decoded.title).to.equal('Empty');
            expect(decoded.resources).to.have.length(0);
        });

        it('should handle single resource', () => {
            const data: MultiDiffEditorUriData = {
                title: 'Single Change',
                resources: [{
                    originalUri: new URI('file:///original/file.ts'),
                    modifiedUri: new URI('file:///modified/file.ts')
                }]
            };
            const uri = MultiDiffEditorUri.encode(data);
            const decoded = MultiDiffEditorUri.decode(uri);
            expect(decoded.title).to.equal('Single Change');
            expect(decoded.resources).to.have.length(1);
            expect(decoded.resources[0].originalUri.toString()).to.equal(data.resources[0].originalUri.toString());
            expect(decoded.resources[0].modifiedUri.toString()).to.equal(data.resources[0].modifiedUri.toString());
        });

        it('should handle URIs with special characters', () => {
            const data: MultiDiffEditorUriData = {
                title: 'Special Chars: äöü & <test>',
                resources: [{
                    originalUri: new URI('file:///path/with spaces/file.ts'),
                    modifiedUri: new URI('file:///path/with%20encoded/file.ts')
                }]
            };
            const uri = MultiDiffEditorUri.encode(data);
            const decoded = MultiDiffEditorUri.decode(uri);
            expect(decoded.title).to.equal(data.title);
            expect(decoded.resources[0].originalUri.toString()).to.equal(data.resources[0].originalUri.toString());
            expect(decoded.resources[0].modifiedUri.toString()).to.equal(data.resources[0].modifiedUri.toString());
        });

        it('should handle a title with slashes without confusing the URI path', () => {
            const data: MultiDiffEditorUriData = {
                title: 'changes/in/nested/path',
                resources: []
            };
            const uri = MultiDiffEditorUri.encode(data);
            const decoded = MultiDiffEditorUri.decode(uri);
            expect(decoded.title).to.equal('changes/in/nested/path');
        });
    });
});
