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

import { expect } from 'chai';
import { Container } from 'inversify';
import { PreferenceTreeGenerator } from './preference-tree-generator';
import { PreferenceSchemaProvider } from '@theia/core/lib/browser';
import { PreferenceConfigurations } from '@theia/core/lib/browser/preferences/preference-configurations';

disableJSDOM();

describe('preference-tree-generator', () => {

    let preferenceTreeGenerator: PreferenceTreeGenerator;

    beforeEach(() => {
        const container = new Container();
        container.bind<any>(PreferenceSchemaProvider).toConstantValue(undefined);
        container.bind<any>(PreferenceConfigurations).toConstantValue(undefined);
        preferenceTreeGenerator = container.resolve(PreferenceTreeGenerator);
    });

    it('PreferenceTreeGenerator.split', () => {
        // We want to ensure that our `split` function emulates the following regex properly:
        const splitter = /[\W_]|(?<=[^A-Z])(?=[A-Z])/;
        const testString = 'aaaBbb.Ccc d E fff GGGgg_iiiJ0a';
        expect(preferenceTreeGenerator['split'](testString)).deep.eq(testString.split(splitter));
    });

});
