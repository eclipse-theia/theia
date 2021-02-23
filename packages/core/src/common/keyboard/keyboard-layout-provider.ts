/********************************************************************************
 * Copyright (C) 2019 TypeFox and others.
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

import type { IKeyboardLayoutInfo, IKeyboardMapping } from 'native-keymap';
import { Event } from '../event';

export const keyboardPath = '/services/keyboard';

export const KeyboardLayoutProvider = Symbol('KeyboardLayoutProvider');

export interface KeyboardLayoutProvider {
    getNativeLayout(): Promise<NativeKeyboardLayout>;
}

export const KeyboardLayoutChangeNotifier = Symbol('KeyboardLayoutChangeNotifier');

export interface KeyboardLayoutChangeNotifier {
    onDidChangeNativeLayout: Event<NativeKeyboardLayout>;
}

export interface KeyValidationInput {
    code: string;
    character: string;
    shiftKey?: boolean;
    ctrlKey?: boolean;
    altKey?: boolean;
}

export const KeyValidator = Symbol('KeyValidator');

export interface KeyValidator {
    validateKey(input: KeyValidationInput): void;
}

export interface NativeKeyboardLayout {
    info: IKeyboardLayoutInfo;
    mapping: IKeyboardMapping;
}
