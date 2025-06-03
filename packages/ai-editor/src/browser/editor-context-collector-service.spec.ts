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

import { MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor';
import { expect } from 'chai';
import { EditorContextCollectorContribution } from './editor-context-collector';
import { EditorContextCollectorService } from './editor-context-collector-service';
import { ContributionProvider } from '@theia/core';

describe('EditorContextCollectorService', () => {
    let service: EditorContextCollectorService;
    let mockEditor: MonacoEditor;
    let mockContributionProvider: ContributionProvider<EditorContextCollectorContribution>;

    function createServiceWithCollectors(collectors: EditorContextCollectorContribution[]): EditorContextCollectorService {
        // Patch an instance to inject the mock provider
        const instance = Object.create(EditorContextCollectorService.prototype);
        mockContributionProvider = {
            getContributions: () => collectors
        };
        instance.collectorProvider = mockContributionProvider;
        return instance as EditorContextCollectorService;
    }

    beforeEach(() => {
        mockEditor = {} as MonacoEditor;
    });

    it('should handle empty collectors list', async () => {
        service = createServiceWithCollectors([]);
        const result = await service.collectEditorContext(mockEditor);
        expect(result).to.deep.equal({});
    });

    it('should collect context from multiple collectors', async () => {
        const collector1: EditorContextCollectorContribution = {
            id: 'collector1',
            priority: 1,
            collectContext: async () => ({ data1: 'value1' })
        };
        const collector2: EditorContextCollectorContribution = {
            id: 'collector2',
            priority: 2,
            collectContext: async () => ({ data2: 'value2' })
        };
        service = createServiceWithCollectors([collector1, collector2]);
        const result = await service.collectEditorContext(mockEditor);
        expect(result).to.deep.equal({
            collector1: { data1: 'value1' },
            collector2: { data2: 'value2' }
        });
    });

    it('should handle collectors that return undefined', async () => {
        const collector1: EditorContextCollectorContribution = {
            id: 'collector1',
            priority: 1,
            collectContext: async () => undefined
        };
        const collector2: EditorContextCollectorContribution = {
            id: 'collector2',
            priority: 2,
            collectContext: async () => ({ data2: 'value2' })
        };
        service = createServiceWithCollectors([collector1, collector2]);
        const result = await service.collectEditorContext(mockEditor);
        expect(result).to.deep.equal({
            collector2: { data2: 'value2' }
        });
    });

    it('should handle collector errors gracefully', async () => {
        const collector1: EditorContextCollectorContribution = {
            id: 'collector1',
            priority: 1,
            collectContext: async () => {
                throw new Error('Test error');
            }
        };
        const collector2: EditorContextCollectorContribution = {
            id: 'collector2',
            priority: 2,
            collectContext: async () => ({ data2: 'value2' })
        };
        service = createServiceWithCollectors([collector1, collector2]);
        const result = await service.collectEditorContext(mockEditor);
        expect(result).to.deep.equal({
            collector2: { data2: 'value2' }
        });
    });

    it('should sort collectors by priority', async () => {
        const executionOrder: string[] = [];
        const lowPriorityCollector: EditorContextCollectorContribution = {
            id: 'low',
            priority: 1,
            collectContext: async () => {
                executionOrder.push('low');
                return { order: executionOrder.length };
            }
        };
        const highPriorityCollector: EditorContextCollectorContribution = {
            id: 'high',
            priority: 10,
            collectContext: async () => {
                executionOrder.push('high');
                return { order: executionOrder.length };
            }
        };
        service = createServiceWithCollectors([lowPriorityCollector, highPriorityCollector]);
        await service.collectEditorContext(mockEditor);
        expect(executionOrder).to.deep.equal(['high', 'low']);
    });
});

