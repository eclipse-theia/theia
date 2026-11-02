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

import { inject, injectable, named, postConstruct } from 'inversify';
import { ILogger } from '../../common/logger';
import { KeyboardLayoutProvider, KeyboardLayoutSource, NativeKeyboardLayout } from '../../common/keyboard/keyboard-layout-provider';
import { LocalStorageService } from '../../browser/storage-service';
import { ElectronKeyboardLayoutChangeNotifier } from './electron-keyboard-layout-change-notifier';

/**
 * The provider of the native keyboard layout of the backend's native-keymap, reached over RPC.
 */
export const ElectronKeyboardLayoutDelegate = Symbol('ElectronKeyboardLayoutDelegate');

/**
 * Provides the native keyboard layout in the Electron frontend without a round trip at start-up: the layout
 * of the last session is cached in local storage and returned at once, while the current one is requested
 * from the backend in the background and announced as a layout change if it differs. The layout rarely
 * changes between sessions, so the keybindings resolved against the cached one are almost always right, and
 * they are resolved again when they are not.
 */
@injectable()
export class CachedElectronKeyboardLayoutProvider implements KeyboardLayoutProvider {

    static readonly STORAGE_KEY = 'keyboard.nativeLayout';

    readonly layoutSource: KeyboardLayoutSource = 'native-keymap';

    @inject(ElectronKeyboardLayoutDelegate)
    protected readonly delegate: KeyboardLayoutProvider;

    @inject(LocalStorageService)
    protected readonly storage: LocalStorageService;

    @inject(ElectronKeyboardLayoutChangeNotifier)
    protected readonly changeNotifier: ElectronKeyboardLayoutChangeNotifier;

    @inject(ILogger) @named('core:CachedElectronKeyboardLayoutProvider')
    protected readonly logger: ILogger;

    @postConstruct()
    protected init(): void {
        this.changeNotifier.onDidChangeNativeLayout(layout => this.storeLayout(layout));
    }

    async getNativeLayout(): Promise<NativeKeyboardLayout> {
        const cached = await this.storage.getData<NativeKeyboardLayout>(CachedElectronKeyboardLayoutProvider.STORAGE_KEY);
        const fresh = this.delegate.getNativeLayout().then(layout => {
            this.storeLayout(layout);
            return layout;
        });
        if (!cached) {
            return fresh;
        }
        fresh.then(layout => {
            if (!this.isSameLayout(layout, cached)) {
                this.changeNotifier.notifyLayoutChanged(layout);
            }
        }).catch(error => this.logger.warn('Could not refresh the native keyboard layout; keeping the cached one.', error));
        return cached;
    }

    protected isSameLayout(a: NativeKeyboardLayout, b: NativeKeyboardLayout): boolean {
        return JSON.stringify(a) === JSON.stringify(b);
    }

    protected storeLayout(layout: NativeKeyboardLayout): void {
        this.storage.setData(CachedElectronKeyboardLayoutProvider.STORAGE_KEY, layout)
            .catch(error => this.logger.warn('Could not cache the native keyboard layout.', error));
    }
}
