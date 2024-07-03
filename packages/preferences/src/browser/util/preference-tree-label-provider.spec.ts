// *****************************************************************************
// Copyright (C) 2020 Ericsson and others.
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

/* eslint-disable @typescript-eslint/no-explicit-any */

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
const disableJSDOM = enableJSDOM();

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import { expect } from 'chai';
import { Container } from '@theia/core/shared/inversify';
import { PreferenceTreeGenerator } from './preference-tree-generator';
import { PreferenceTreeLabelProvider } from './preference-tree-label-provider';
import { Preference } from './preference-types';
import { SelectableTreeNode } from '@theia/core/lib/browser';
import { PreferenceLayoutProvider } from './preference-layout';

disableJSDOM();

describe('preference-tree-label-provider', () => {

    let preferenceTreeLabelProvider: PreferenceTreeLabelProvider;

    beforeEach(() => {
        const container = new Container();
        container.bind(PreferenceLayoutProvider).toSelf().inSingletonScope();
        container.bind<any>(PreferenceTreeGenerator).toConstantValue({ getCustomLabelFor: () => { } });
        preferenceTreeLabelProvider = container.resolve(PreferenceTreeLabelProvider);
    });

    it('PreferenceTreeLabelProvider.format', () => {
        const testString = 'aaaBbbCcc Dddd eee';
        expect(preferenceTreeLabelProvider['formatString'](testString)).eq('Aaa Bbb Ccc Dddd eee');
    });

    it('PreferenceTreeLabelProvider.format.Chinese', () => {
        const testString = '某個設定/某个设定';
        expect(preferenceTreeLabelProvider['formatString'](testString)).eq('某個設定/某个设定');
    });

    it('PreferenceTreeLabelProvider.format.Danish', () => {
        const testString = 'indstillingPåEnØ';
        expect(preferenceTreeLabelProvider['formatString'](testString)).eq('Indstilling På En Ø');
    });

    it('PreferenceTreeLabelProvider.format.Greek', () => {
        const testString = 'κάποιαΡύθμιση';
        expect(preferenceTreeLabelProvider['formatString'](testString)).eq('Κάποια Ρύθμιση');
    });

    it('PreferenceTreeLabelProvider.format.Russian', () => {
        const testString = 'некоторыеНастройки';
        expect(preferenceTreeLabelProvider['formatString'](testString)).eq('Некоторые Настройки');
    });

    it('PreferenceTreeLabelProvider.format.Armenian', () => {
        const testString = 'ինչ-որՊարամետր';
        expect(preferenceTreeLabelProvider['formatString'](testString)).eq('Ինչ-որ Պարամետր');
    });

    it('PreferenceTreeLabelProvider.format.specialCharacters', () => {
        const testString = 'hyphenated-wordC++Setting';
        expect(preferenceTreeLabelProvider['formatString'](testString)).eq('Hyphenated-word C++ Setting');
    });

    describe('PreferenceTreeLabelProvider.createLeafNode', () => {
        it('when property constructs of three parts the third part is the leaf', () => {
            const property = 'category-name.subcategory.leaf';
            const expectedName = 'Leaf';
            testLeafName(property, expectedName);
        });

        it('when property constructs of two parts the second part is the leaf', () => {
            const property = 'category-name.leaf';
            const expectedName = 'Leaf';
            testLeafName(property, expectedName);
        });

        function testLeafName(property: string, expectedName: string): void {

            const expectedSelectableTreeNode: Preference.LeafNode & SelectableTreeNode = {
                id: `group@${property}`,
                parent: undefined,
                visible: true,
                selected: false,
                depth: 2,
                preferenceId: property,
                preference: { data: {} }
            };

            expect(preferenceTreeLabelProvider['getName'](expectedSelectableTreeNode)).deep.eq(expectedName);
        }

    });
});
