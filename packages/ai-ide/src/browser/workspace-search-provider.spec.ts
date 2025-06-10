// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
let disableJSDOM = enableJSDOM();
FrontendApplicationConfigProvider.set({});

import { expect } from 'chai';
import { URI } from '@theia/core';
import { SearchInWorkspaceResult, LinePreview } from '@theia/search-in-workspace/lib/common/search-in-workspace-interface';
import { optimizeSearchResults } from '../common/workspace-search-provider-util';

disableJSDOM();

describe('WorkspaceSearchProvider - Token Optimization', () => {

    before(() => {
        disableJSDOM = enableJSDOM();
    });

    after(() => {
        disableJSDOM();
    });

    describe('optimizeSearchResults method', () => {
        it('should preserve all information while optimizing format', () => {
            const workspaceRoot = new URI('file:///workspace');
            const mockResults: SearchInWorkspaceResult[] = [
                {
                    root: 'file:///workspace',
                    fileUri: 'file:///workspace/src/test.ts',
                    matches: [
                        {
                            line: 1,
                            character: 5,
                            length: 8,
                            lineText: '  const test = "hello";  '
                        },
                        {
                            line: 5,
                            character: 10,
                            length: 4,
                            lineText: '\t\tfunction test() { }\n'
                        }
                    ]
                },
                {
                    root: 'file:///workspace',
                    fileUri: 'file:///workspace/lib/utils.js',
                    matches: [
                        {
                            line: 10,
                            character: 0,
                            length: 6,
                            lineText: 'export default function() {}'
                        }
                    ]
                }
            ];

            const result = optimizeSearchResults(mockResults, workspaceRoot);

            expect(result).to.have.length(2);

            // First file
            expect(result[0]).to.deep.equal({
                file: 'src/test.ts',
                matches: [
                    {
                        line: 1,
                        text: 'const test = "hello";'
                    },
                    {
                        line: 5,
                        text: 'function test() { }'
                    }
                ]
            });

            // Second file
            expect(result[1]).to.deep.equal({
                file: 'lib/utils.js',
                matches: [
                    {
                        line: 10,
                        text: 'export default function() {}'
                    }
                ]
            });
        });

        it('should handle LinePreview objects correctly', () => {
            const workspaceRoot = new URI('file:///workspace');
            const linePreview: LinePreview = {
                text: '  preview text with spaces  ',
                character: 5
            };

            const mockResults: SearchInWorkspaceResult[] = [
                {
                    root: 'file:///workspace',
                    fileUri: 'file:///workspace/preview.ts',
                    matches: [
                        {
                            line: 3,
                            character: 5,
                            length: 7,
                            lineText: linePreview
                        }
                    ]
                }
            ];

            const result = optimizeSearchResults(mockResults, workspaceRoot);

            expect(result[0].matches[0]).to.deep.equal({
                line: 3,
                text: 'preview text with spaces'
            });
        });

        it('should handle empty LinePreview text gracefully', () => {
            const workspaceRoot = new URI('file:///workspace');
            const linePreview: LinePreview = {
                text: '',
                character: 0
            };

            const mockResults: SearchInWorkspaceResult[] = [
                {
                    root: 'file:///workspace',
                    fileUri: 'file:///workspace/empty.ts',
                    matches: [
                        {
                            line: 1,
                            character: 0,
                            length: 0,
                            lineText: linePreview
                        }
                    ]
                }
            ];

            const result = optimizeSearchResults(mockResults, workspaceRoot);

            expect(result[0].matches[0]).to.deep.equal({
                line: 1,
                text: ''
            });
        });

        it('should preserve semantic whitespace within lines', () => {
            const workspaceRoot = new URI('file:///workspace');
            const mockResults: SearchInWorkspaceResult[] = [
                {
                    root: 'file:///workspace',
                    fileUri: 'file:///workspace/spaces.ts',
                    matches: [
                        {
                            line: 1,
                            character: 0,
                            length: 20,
                            lineText: '  if (a    &&    b) {  '
                        }
                    ]
                }
            ];

            const result = optimizeSearchResults(mockResults, workspaceRoot);

            expect(result[0].matches[0].text).to.equal('if (a    &&    b) {');
        });

        it('should use absolute URI when relative path cannot be determined', () => {
            const workspaceRoot = new URI('file:///different-workspace');
            const mockResults: SearchInWorkspaceResult[] = [
                {
                    root: 'file:///workspace',
                    fileUri: 'file:///workspace/outside.ts',
                    matches: [
                        {
                            line: 1,
                            character: 0,
                            length: 4,
                            lineText: 'test'
                        }
                    ]
                }
            ];

            const result = optimizeSearchResults(mockResults, workspaceRoot);

            expect(result[0].file).to.equal('file:///workspace/outside.ts');
        });
    });

    describe('token efficiency validation', () => {
        it('should produce more compact JSON than original format', () => {
            const workspaceRoot = new URI('file:///workspace');
            const mockResults: SearchInWorkspaceResult[] = [
                {
                    root: 'file:///workspace',
                    fileUri: 'file:///workspace/src/test.ts',
                    matches: [
                        {
                            line: 1,
                            character: 5,
                            length: 8,
                            lineText: '  const test = "hello";  '
                        }
                    ]
                }
            ];

            // Original format (simulated)
            const originalFormat = JSON.stringify([{
                root: 'file:///workspace',
                fileUri: 'file:///workspace/src/test.ts',
                matches: [{
                    line: 1,
                    character: 5,
                    length: 8,
                    lineText: '  const test = "hello";  '
                }]
            }]);

            // Optimized format
            const optimizedResults = optimizeSearchResults(mockResults, workspaceRoot);
            const optimizedFormat = JSON.stringify(optimizedResults);

            // The optimized format should be significantly shorter
            expect(optimizedFormat.length).to.be.lessThan(originalFormat.length);

            // But should preserve essential information
            const parsed = JSON.parse(optimizedFormat);
            expect(parsed[0].file).to.equal('src/test.ts');
            expect(parsed[0].matches[0].line).to.equal(1);
            expect(parsed[0].matches[0].text).to.equal('const test = "hello";');
        });
    });
});
