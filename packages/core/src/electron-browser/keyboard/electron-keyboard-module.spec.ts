// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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
import { NativeKeyboardLayout } from '../../common/keyboard/keyboard-layout-provider';
import { createElectronKeyboardLayoutProvider } from './electron-keyboard-module';

describe('Electron keyboard layout provider', () => {
    it('reports the native-keymap source and delegates layout retrieval', async () => {
        const layout: NativeKeyboardLayout = { info: { id: 'test', lang: 'en' }, mapping: {} };
        const provider = createElectronKeyboardLayoutProvider({ getNativeLayout: async () => layout });

        expect(provider.layoutSource).to.equal('native-keymap');
        expect(await provider.getNativeLayout()).to.equal(layout);
    });
});
