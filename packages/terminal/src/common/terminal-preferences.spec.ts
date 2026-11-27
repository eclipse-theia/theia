// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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
import { TerminalConfigSchema } from './terminal-preferences.js';

describe('TerminalConfigSchema', () => {

    const RESTRICTED_PREFERENCES = ['shell', 'shellArgs', 'profiles', 'defaultProfile'].flatMap(
        kind => ['windows', 'linux', 'osx'].map(os => `terminal.integrated.${kind}.${os}`)
    );

    it('should mark the shell and profile settings as restricted', () => {
        for (const name of RESTRICTED_PREFERENCES) {
            expect(TerminalConfigSchema.properties[name]?.restricted, name).to.be.true;
        }
    });

    it('should not mark the other settings as restricted', () => {
        expect(TerminalConfigSchema.defaultRestricted).to.not.be.true;
        const others = Object.keys(TerminalConfigSchema.properties).filter(name => !RESTRICTED_PREFERENCES.includes(name));
        expect(others).to.not.be.empty;
        for (const name of others) {
            expect(TerminalConfigSchema.properties[name].restricted, name).to.not.be.true;
        }
    });
});
