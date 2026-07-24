// *****************************************************************************
// Copyright (C) 2026 Maksim Kachurin and others.
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

import { expect } from 'chai';
import { PLUGIN_COPY_IGNORE } from '../constants';

describe('constants', () => {

    describe('PLUGIN_COPY_IGNORE', () => {
        it('skips git metadata and node_modules anywhere in the path', () => {
            expect(PLUGIN_COPY_IGNORE.test('/plugin/.git/config')).to.equal(true);
            expect(PLUGIN_COPY_IGNORE.test('/plugin/node_modules/pkg/index.js')).to.equal(true);
            expect(PLUGIN_COPY_IGNORE.test('/plugin\\node_modules\\pkg')).to.equal(true);
        });

        it('allows regular plugin files', () => {
            expect(PLUGIN_COPY_IGNORE.test('/plugin/dist/extension.js')).to.equal(false);
            expect(PLUGIN_COPY_IGNORE.test('/plugin/media/icon.png')).to.equal(false);
        });
    });
});
