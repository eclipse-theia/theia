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
import { Emitter } from '../../common/event';
import { Deferred } from '../../common/promise-util';
import { NativeKeyboardLayout } from '../../common/keyboard/keyboard-layout-provider';
import { CachedElectronKeyboardLayoutProvider } from './cached-electron-keyboard-layout-provider';

describe('CachedElectronKeyboardLayoutProvider', () => {

    const us: NativeKeyboardLayout = { info: { id: 'com.apple.keylayout.US', lang: 'en' }, mapping: {} };
    const de: NativeKeyboardLayout = { info: { id: 'com.apple.keylayout.German', lang: 'de' }, mapping: {} };

    class TestProvider extends CachedElectronKeyboardLayoutProvider {
        readonly stored = new Map<string, unknown>();
        readonly announced: NativeKeyboardLayout[] = [];
        readonly warnings: string[] = [];
        readonly nativeChanges = new Emitter<NativeKeyboardLayout>();
        readonly backend = new Deferred<NativeKeyboardLayout>();

        constructor(cached?: NativeKeyboardLayout) {
            super();
            if (cached) {
                this.stored.set(CachedElectronKeyboardLayoutProvider.STORAGE_KEY, cached);
            }
            Object.assign(this, {
                delegate: { getNativeLayout: () => this.backend.promise },
                storage: {
                    getData: async (key: string) => this.stored.get(key),
                    setData: async (key: string, data: unknown) => { this.stored.set(key, data); }
                },
                changeNotifier: {
                    onDidChangeNativeLayout: this.nativeChanges.event,
                    notifyLayoutChanged: (layout: NativeKeyboardLayout) => this.announced.push(layout)
                },
                logger: { warn: (message: string) => this.warnings.push(message) }
            });
            this.init();
        }

        get cache(): NativeKeyboardLayout | undefined {
            return this.stored.get(CachedElectronKeyboardLayoutProvider.STORAGE_KEY) as NativeKeyboardLayout | undefined;
        }
    }

    const settle = () => new Promise(resolve => setTimeout(resolve, 0));

    it('waits for the backend and caches its layout when nothing is cached', async () => {
        const provider = new TestProvider();
        const layout = provider.getNativeLayout();
        let resolved = false;
        layout.then(() => { resolved = true; });
        await settle();
        expect(resolved).to.be.false;
        provider.backend.resolve(us);
        expect(await layout).to.deep.equal(us);
        expect(provider.cache).to.deep.equal(us);
        expect(provider.announced).to.be.empty;
    });

    it('returns the cached layout at once and does not announce an unchanged backend layout', async () => {
        const provider = new TestProvider(us);
        expect(await provider.getNativeLayout()).to.deep.equal(us);
        provider.backend.resolve({ ...us });
        await settle();
        expect(provider.announced).to.be.empty;
        expect(provider.cache).to.deep.equal(us);
    });

    it('announces and caches a backend layout that differs from the cached one', async () => {
        const provider = new TestProvider(us);
        expect(await provider.getNativeLayout()).to.deep.equal(us);
        provider.backend.resolve(de);
        await settle();
        expect(provider.announced).to.deep.equal([de]);
        expect(provider.cache).to.deep.equal(de);
    });

    it('keeps the cached layout and warns when the backend cannot be asked', async () => {
        const provider = new TestProvider(us);
        expect(await provider.getNativeLayout()).to.deep.equal(us);
        provider.backend.reject(new Error('no connection'));
        await settle();
        expect(provider.announced).to.be.empty;
        expect(provider.cache).to.deep.equal(us);
        expect(provider.warnings).to.have.lengthOf(1);
    });

    it('caches a native layout change announced by the main process', async () => {
        const provider = new TestProvider(us);
        provider.nativeChanges.fire(de);
        await settle();
        expect(provider.cache).to.deep.equal(de);
    });
});
