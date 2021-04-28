/********************************************************************************
 * Copyright (C) 2020 Ericsson and others.
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

/* eslint-disable @typescript-eslint/no-explicit-any */

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
const disableJSDOM = enableJSDOM();

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
import { ApplicationProps } from '@theia/application-package/lib/application-props';
FrontendApplicationConfigProvider.set({
    ...ApplicationProps.DEFAULT.frontend.config
});

import { expect } from 'chai';
import { Container } from '@theia/core/shared/inversify';
import { PreferenceTreeGenerator } from './preference-tree-generator';
import { PreferenceTreeLabelProvider } from './preference-tree-label-provider';
import { Preference } from './preference-types';
import { SelectableTreeNode } from '@theia/core/src/browser';

disableJSDOM();

describe('preference-tree-label-provider', () => {

    let preferenceTreeLabelprovider: PreferenceTreeLabelProvider;

    beforeEach(() => {
        const container = new Container();
        container.bind<any>(PreferenceTreeGenerator).toConstantValue({ getCustomLabelFor: () => { } });
        preferenceTreeLabelprovider = container.resolve(PreferenceTreeLabelProvider);
    });

    it('PreferenceTreeLabelProvider.format', () => {
        const testString = 'aaaBbbCcc Dddd eee';
        expect(preferenceTreeLabelprovider['formatString'](testString)).eq('Aaa Bbb Ccc Dddd eee');
    });

    it('PreferenceTreeLabelProvider.format.Chinese', () => {
        const testString = '某個設定/某个设定';
        expect(preferenceTreeLabelprovider['formatString'](testString)).eq('某個設定/某个设定');
    });

    it('PreferenceTreeLabelProvider.format.Danish', () => {
        const testString = 'indstillingPåEnØ';
        expect(preferenceTreeLabelprovider['formatString'](testString)).eq('Indstilling På En Ø');
    });

    it('PreferenceTreeLabelProvider.format.Greek', () => {
        const testString = 'κάποιαΡύθμιση';
        expect(preferenceTreeLabelprovider['formatString'](testString)).eq('Κάποια Ρύθμιση');
    });

    it('PreferenceTreeLabelProvider.format.Russian', () => {
        const testString = 'некоторыеНастройки';
        expect(preferenceTreeLabelprovider['formatString'](testString)).eq('Некоторые Настройки');
    });

    it('PreferenceTreeLabelProvider.format.Armenian', () => {
        const testString = 'ինչ-որՊարամետր';
        expect(preferenceTreeLabelprovider['formatString'](testString)).eq('Ինչ-որ Պարամետր');
    });

    it('PreferenceTreeLabelProvider.format.specialCharacters', () => {
        const testString = 'hyphenated-wordC++Setting';
        expect(preferenceTreeLabelprovider['formatString'](testString)).eq('Hyphenated-word C++ Setting');
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
                preference: { data: {} }
            };

            expect(preferenceTreeLabelprovider['getName'](expectedSelectableTreeNode)).deep.eq(expectedName);
        }

    });
});
