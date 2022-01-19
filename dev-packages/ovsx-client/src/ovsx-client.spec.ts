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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import * as chai from 'chai';
import { OVSXClient } from './ovsx-client';
import { NodeRequestService } from '@theia/request-service/lib/node-request-service';
import { VSXSearchParam } from './ovsx-types';

const expect = chai.expect;

describe('OVSX Client', () => {

    const apiUrl = 'https://open-vsx.org/api';
    const apiVersion = '1.40.0';

    let client: OVSXClient;

    before(() => {
        client = new OVSXClient({
            apiVersion,
            apiUrl
        }, new NodeRequestService());
    });

    describe('isEngineValid', () => {

        it('should return \'true\' for a compatible engine', () => {
            const a: boolean = client['isEngineSupported']('^1.20.0');
            const b: boolean = client['isEngineSupported']('^1.40.0');
            expect(a).to.eq(true);
            expect(b).to.eq(true);
        });

        it('should return \'true\' for the wildcard \'*\' engine', () => {
            const valid: boolean = client['isEngineSupported']('*');
            expect(valid).to.eq(true);
        });

        it('should return \'false\' for a incompatible engine', () => {
            const valid: boolean = client['isEngineSupported']('^1.50.0');
            expect(valid).to.eq(false);
        });

        it('should return \'false\' for an undefined engine', () => {
            const valid: boolean = client['isEngineSupported']();
            expect(valid).to.eq(false);
        });

    });

    describe('#buildSearchUri', () => {

        it('should correctly build the search URI with the single `query` parameter present', async () => {
            const expected = 'https://open-vsx.org/api/-/search?query=javascript';
            const param: VSXSearchParam = {
                query: 'javascript',
            };
            const query = await client['buildSearchUri'](param);
            expect(query).to.eq(expected);
        });

        it('should correctly build the search URI with the multiple search parameters present', async () => {
            let expected = 'https://open-vsx.org/api/-/search?query=javascript&category=languages&size=20&offset=10&includeAllVersions=true';
            let param: VSXSearchParam = {
                query: 'javascript',
                category: 'languages',
                size: 20,
                offset: 10,
                includeAllVersions: true,
            };
            let query = await client['buildSearchUri'](param);
            expect(query).to.eq(expected);

            expected = 'https://open-vsx.org/api/-/search?query=javascript&category=languages&size=20&offset=10&sortOrder=desc&sortBy=relevance&includeAllVersions=true';
            param = {
                query: 'javascript',
                category: 'languages',
                size: 20,
                offset: 10,
                sortOrder: 'desc',
                sortBy: 'relevance',
                includeAllVersions: true
            };
            query = await client['buildSearchUri'](param);
            expect(query).to.eq(expected);
        });

    });

    describe('#isVersionLTE', () => {

        it('should determine if v1 is less than or equal to v2', () => {
            expect(client['isVersionLTE']('1.40.0', '1.50.0')).equal(true, 'should be satisfied since v1 is less than v2');
            expect(client['isVersionLTE']('1.50.0', '1.50.0')).equal(true, 'should be satisfied since v1 and v2 are equal');
            expect(client['isVersionLTE']('2.0.2', '2.0.1')).equal(false, 'should not be satisfied since v1 is greater than v2');
        });

        it('should support \'preview\' versions', () => {
            expect(client['isVersionLTE']('1.40.0-next.622cb03f7e0', '1.50.0')).equal(true, 'should be satisfied since v1 is less than v2');
            expect(client['isVersionLTE']('1.50.0-next.622cb03f7e0', '1.50.0')).equal(true, 'should be satisfied since v1 and v2 are equal');
            expect(client['isVersionLTE']('1.50.0-next.622cb03f7e0', '1.50.0-next.622cb03f7e0')).equal(true, 'should be satisfied since v1 and v2 are equal');
            expect(client['isVersionLTE']('2.0.2-next.622cb03f7e0', '2.0.1')).equal(false, 'should not be satisfied since v1 is greater than v2');
        });

    });

});
