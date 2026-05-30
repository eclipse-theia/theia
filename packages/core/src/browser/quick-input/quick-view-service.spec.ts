// *****************************************************************************
// Copyright (C) 2026 Safi Seid-Ahmad, K2view and others.
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

import * as chai from 'chai';
import { CancellationToken } from '../../common';
import { QuickPickItem } from './quick-input-service';
import { QuickViewService } from './quick-view-service';

const expect = chai.expect;

describe('quick-view-service', () => {

    describe('#getPicks', () => {

        function labelsOf(service: QuickViewService): (string | undefined)[] {
            return service.getPicks('', CancellationToken.None).map(pick => (pick as QuickPickItem).label);
        }

        it('returns registered items with a non-empty label', () => {
            const service = new QuickViewService();
            service.registerItem({ label: 'Explorer', open: () => { } });

            expect(labelsOf(service)).to.deep.equal(['Explorer']);
        });

        it('omits items with an empty or whitespace-only label', () => {
            const service = new QuickViewService();
            service.registerItem({ label: 'Explorer', open: () => { } });
            service.registerItem({ label: '', open: () => { } });
            service.registerItem({ label: '   ', open: () => { } });

            expect(labelsOf(service)).to.deep.equal(['Explorer']);
        });

    });

});
