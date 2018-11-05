/********************************************************************************
 * Copyright (C) 2017 Ericsson and others.
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

import { expect } from 'chai';
import { DefaultUriLabelProviderContribution, FOLDER_ICON } from './label-provider';
import URI from '../common/uri';

describe('DefaultUriLabelProviderContribution', function () {

    it('should return a short name', function () {
        const prov = new DefaultUriLabelProviderContribution();
        const shortName = prov.getName(new URI('file:///tmp/hello/you.txt'));

        expect(shortName).eq('you.txt');
    });

    it('should return a long name', function () {
        const prov = new DefaultUriLabelProviderContribution();
        const longName = prov.getLongName(new URI('file:///tmp/hello/you.txt'));

        expect(longName).eq('/tmp/hello/you.txt');
    });

    it('should return icon class for something that seems to be a file', function () {
        const prov = new DefaultUriLabelProviderContribution();
        const icon = prov.getIcon(new URI('file:///tmp/hello/you.txt'));

        expect(icon).eq('text-icon medium-blue');
    });

    it('should return icon class for something that seems to be a directory', function () {
        const prov = new DefaultUriLabelProviderContribution();
        const icon = prov.getIcon(new URI('file:///tmp/hello'));

        expect(icon).eq(FOLDER_ICON);
    });
});
