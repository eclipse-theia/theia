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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
const disableJSDOM = enableJSDOM();

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import { expect } from 'chai';
import { Container } from '@theia/core/shared/inversify';
import { CompositeTreeNode, TreeNode } from '@theia/core/lib/browser';
import { Event, PreferenceConfigurations, PreferenceDataProperty, PreferenceSchema, PreferenceSchemaService } from '@theia/core';
import { PreferenceTreeGenerator } from './preference-tree-generator.js';
import { PreferenceTreeLabelProvider } from './preference-tree-label-provider.js';
import { PreferenceLayoutProvider } from './preference-layout.js';

disableJSDOM();

describe('preference-tree-generator', () => {

    const extensionInfo = { id: 'acme.sample', displayName: 'Sample Extension' };

    let schemas: PreferenceSchema[];
    let generator: PreferenceTreeGenerator;

    beforeEach(() => {
        schemas = [];
        const container = new Container();
        container.bind(PreferenceLayoutProvider).toSelf().inSingletonScope();
        container.bind(PreferenceTreeLabelProvider).toSelf().inSingletonScope();
        container.bind(PreferenceConfigurations).toConstantValue({ isSectionName: () => false } as unknown as PreferenceConfigurations);
        container.bind(PreferenceSchemaService).toConstantValue({
            onDidChangeSchema: Event.None,
            getSchemaProperties: () => new Map<string, PreferenceDataProperty>(schemas.flatMap(schema => Object.entries(schema.properties))),
            getSchemaForProperty: (key: string) => schemas.find(schema => key in schema.properties)
        } as unknown as PreferenceSchemaService);
        container.bind(PreferenceTreeGenerator).toSelf().inSingletonScope();
        generator = container.get(PreferenceTreeGenerator);
    });

    function addSchema(schema: Omit<PreferenceSchema, 'properties'>, ...keys: string[]): void {
        schemas.push({ ...schema, properties: Object.fromEntries(keys.map(key => [key, { type: 'boolean' }])) });
    }

    /** Returns the parent of the node of a preference outside of the 'Commonly Used' section */
    function parentOf(preferenceId: string): CompositeTreeNode | undefined {
        const root = generator.generateTree();
        const nodeId = generator.getNodeId(preferenceId);
        const find = (node: TreeNode): TreeNode | undefined => {
            if (CompositeTreeNode.is(node)) {
                for (const child of node.children) {
                    const found = find(child);
                    if (found) {
                        return found;
                    }
                }
            }
            return node.id === nodeId ? node : undefined;
        };
        return find(root)?.parent;
    }

    it('lists all preferences of an extension under that extension, whatever their prefix', () => {
        addSchema({ extensionInfo }, 'sample.enabled', 'editor.sampleFeature', 'unrelated.setting');

        for (const key of ['sample.enabled', 'editor.sampleFeature', 'unrelated.setting']) {
            const parent = parentOf(key);
            expect(parent?.id, key).to.equal('extensions@extensions.acme.sample');
            expect((parent as { label?: string }).label, key).to.equal('Sample Extension');
        }
    });

    it('uses the title of the only configuration as label of the extension', () => {
        addSchema({ extensionInfo, title: 'Sample' }, 'sample.enabled');

        expect((parentOf('sample.enabled') as { label?: string }).label).to.equal('Sample');
    });

    it('groups the configurations of an extension by title', () => {
        addSchema({ extensionInfo, title: 'General' }, 'sample.enabled');
        addSchema({ extensionInfo, title: 'Advanced' }, 'sample.count');
        addSchema({ extensionInfo, title: 'Sample Extension' }, 'sample.root');

        expect(parentOf('sample.enabled')?.id).to.equal('extensions.acme.sample@extensions.acme.sample.General');
        expect(parentOf('sample.count')?.id).to.equal('extensions.acme.sample@extensions.acme.sample.Advanced');
        expect(parentOf('sample.root')?.id).to.equal('extensions@extensions.acme.sample');
    });

    it('does not merge extensions with the same title', () => {
        addSchema({ extensionInfo, title: 'General' }, 'sample.enabled');
        addSchema({ extensionInfo: { id: 'other.sample', displayName: 'Other Extension' }, title: 'General' }, 'other.enabled');

        expect(parentOf('sample.enabled')?.id).to.equal('extensions@extensions.acme.sample');
        expect(parentOf('other.enabled')?.id).to.equal('extensions@extensions.other.sample');
    });

    it('places preferences without an extension according to the layout', () => {
        addSchema({}, 'editor.fontLigatures');

        expect(parentOf('editor.fontLigatures')?.id).to.equal('editor@editor.font');
    });
});
