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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';

let disableJSDOM = enableJSDOM();

import { expect } from 'chai';
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import { Container } from '@theia/core/shared/inversify';
import { TreeNode } from '@theia/core/lib/browser/tree/tree';
import { DEFAULT_INFO_ICON, ResourcePropertiesLabelProvider, } from './resource-property-view-label-provider';
import { LabelProvider, LabelProviderContribution } from '@theia/core/lib/browser/label-provider';
import { ContributionProvider } from '@theia/core/lib/common';
import { ResourcePropertiesCategoryNode, ResourcePropertiesItemNode } from './resource-property-view-tree-items';

disableJSDOM();

let resourcePropertiesLabelProvider: ResourcePropertiesLabelProvider;

describe('resource-property-view-label', () => {

    before(() => {
        disableJSDOM = enableJSDOM();
        const container = new Container();
        container.bind(ResourcePropertiesLabelProvider).toSelf().inSingletonScope();
        container.bind(LabelProvider).toSelf().inSingletonScope();
        container.bind<Partial<ContributionProvider<LabelProviderContribution>>>(ContributionProvider)
            .toConstantValue({
                getContributions: () => [],
            })
            .whenTargetNamed(LabelProviderContribution);
        resourcePropertiesLabelProvider = container.get(ResourcePropertiesLabelProvider);
    });

    after(() => {
        disableJSDOM();
    });

    const categoryNode: ResourcePropertiesCategoryNode = {
        name: 'category',
        id: '',
        icon: 'iconCategory',
        children: [],
        parent: {
            id: '',
            parent: undefined,
            children: []
        },
        categoryId: '',
        expanded: false,
        selected: false,
    };

    const itemNode: ResourcePropertiesItemNode = {
        name: 'item',
        id: '',
        icon: 'iconItem',
        selected: false,
        parent: {
            name: 'category',
            id: '',
            icon: '',
            children: [],
            parent: {
                id: '',
                parent: undefined,
                children: []
            },
            categoryId: '',
            expanded: false,
            selected: false,
        },
        property: 'property'
    };

    describe('#canHandle', () => {
        it('should handle a category node', () => {
            expect(resourcePropertiesLabelProvider.canHandle(categoryNode)).to.be.greaterThan(0);
        });

        it('should handle an item node', () => {
            expect(resourcePropertiesLabelProvider.canHandle(itemNode)).to.be.greaterThan(0);
        });

        it('should not handle a tree node (not an item nor a category)', () => {
            const node: TreeNode = {
                id: '',
                parent: undefined
            };
            expect(resourcePropertiesLabelProvider.canHandle(node)).eq(0);
        });

    });

    describe('#getIcon', () => {
        it('should get the icon of a category node', () => {
            expect(resourcePropertiesLabelProvider.getIcon(categoryNode)).eq('iconCategory');
        });

        it('should get the default icon if a category node has an undefined icon field', () => {
            const emptyIconCategory: ResourcePropertiesCategoryNode = categoryNode;
            emptyIconCategory.icon = undefined;
            expect(resourcePropertiesLabelProvider.getIcon(emptyIconCategory)).eq(DEFAULT_INFO_ICON);
        });

        it('should get the icon of an item node', () => {
            expect(resourcePropertiesLabelProvider.getIcon(itemNode)).eq('iconItem');
        });

        it('should get an empty string if an item node has an undefined icon field', () => {
            const emptyIconItem: ResourcePropertiesItemNode = itemNode;
            emptyIconItem.icon = undefined;
            expect(resourcePropertiesLabelProvider.getIcon(emptyIconItem)).eq('');
        });
    });

    describe('#getName', () => {
        it('should get the name of a category node', () => {
            expect(resourcePropertiesLabelProvider.getName(categoryNode)).eq('category');
        });

        it('should get the name of an item node', () => {
            expect(resourcePropertiesLabelProvider.getName(itemNode)).eq('item');
        });
    });

    describe('#getLongName', () => {
        it('should get the property of an item node', () => {
            expect(resourcePropertiesLabelProvider.getLongName(itemNode)).eq('property');
        });

        it('should get the name of a category node', () => {
            expect(resourcePropertiesLabelProvider.getLongName(categoryNode)).eq('category');
        });
    });

});
