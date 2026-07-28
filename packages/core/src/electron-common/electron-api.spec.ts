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
import { electronMenuAccelerator, electronMenuAcceleratorMetadata, isElectronAcceleratorRepresentable } from './electron-api';

describe('Electron menu accelerators', () => {
    it('accepts only ASCII accelerators without AltGr', () => {
        expect(isElectronAcceleratorRepresentable('Ctrl+8')).to.be.true;
        expect(isElectronAcceleratorRepresentable('Ctrl+AltGr+8')).to.be.false;
        expect(isElectronAcceleratorRepresentable('Ctrl+ä')).to.be.false;
        expect(isElectronAcceleratorRepresentable('Ctrl++')).to.be.false;
        expect(isElectronAcceleratorRepresentable('Ctrl+K Ctrl+S')).to.be.false;
    });

    it('marks only one representable stroke as a native accelerator', () => {
        expect(electronMenuAcceleratorMetadata(['Ctrl+8'])).to.deep.equal({
            accelerator: 'Ctrl+8',
            acceleratorRepresentable: true
        });
        expect(electronMenuAcceleratorMetadata(['Ctrl+K', 'Ctrl+S'])).to.deep.equal({
            accelerator: 'Ctrl+K Ctrl+S',
            acceleratorRepresentable: false
        });
    });

    it('omits unrepresentable accelerators', () => {
        expect(electronMenuAccelerator({
            accelerator: 'Ctrl+AltGr+8',
            acceleratorRepresentable: false,
            registerAccelerator: false
        }, false)).to.deep.equal({});
    });

    it('selectively disables registration only where Electron supports it', () => {
        const dto = {
            accelerator: 'Ctrl+8',
            acceleratorRepresentable: true,
            registerAccelerator: false
        };
        expect(electronMenuAccelerator(dto, false)).to.deep.equal({ accelerator: 'Ctrl+8', registerAccelerator: false });
        expect(electronMenuAccelerator(dto, true)).to.deep.equal({ accelerator: 'Ctrl+8', registerAccelerator: undefined });
        expect(electronMenuAccelerator({ ...dto, role: 'copy' }, false))
            .to.deep.equal({ accelerator: 'Ctrl+8', registerAccelerator: undefined });
    });
});
