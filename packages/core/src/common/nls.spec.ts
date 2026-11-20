// *****************************************************************************
// Copyright (C) 2026 STMicroelectronics and others.
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
import { nls } from './nls.js';

describe('nls', () => {

    afterEach(() => {
        nls.localization = undefined;
    });

    describe('localizeByDefault', () => {

        it('returns the formatted default value without a localization', () => {
            expect(nls.localizeByDefault('Open {0}', 'file')).to.equal('Open file');
        });

        it('applies a text replacement when the localization has no translations', () => {
            nls.localization = { languageId: 'en', translations: {}, replacements: { 'Open {0}': 'Show {0}' } };
            expect(nls.localizeByDefault('Open {0}', 'file')).to.equal('Show file');
            expect(nls.localizeByDefault('Close {0}', 'file')).to.equal('Close file');
        });

        it('translates a default value through its key when the localization has translations', () => {
            const key = nls.getDefaultKey('Close');
            expect(key).to.not.equal('');
            nls.localization = { languageId: 'de', translations: { [key]: 'Schließen' } };
            expect(nls.localizeByDefault('Close')).to.equal('Schließen');
        });
    });
});
