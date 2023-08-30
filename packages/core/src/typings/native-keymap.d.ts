// *****************************************************************************
// Copyright (C) 2018 TypeFox and others.
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
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'native-keymap' {

    export interface IWindowsKeyMapping {
        vkey: string;
        value: string;
        withShift: string;
        withAltGr: string;
        withShiftAltGr: string;
    }
    export interface IWindowsKeyboardMapping {
        [code: string]: IWindowsKeyMapping;
    }
    export interface ILinuxKeyMapping {
        value: string;
        withShift: string;
        withAltGr: string;
        withShiftAltGr: string;
    }
    export interface ILinuxKeyboardMapping {
        [code: string]: ILinuxKeyMapping;
    }
    export interface IMacKeyMapping {
        value: string;
        withShift: string;
        withAltGr: string;
        withShiftAltGr: string;
        valueIsDeadKey: boolean;
        withShiftIsDeadKey: boolean;
        withAltGrIsDeadKey: boolean;
        withShiftAltGrIsDeadKey: boolean;
    }
    export interface IMacKeyboardMapping {
        [code: string]: IMacKeyMapping;
    }

    export type IKeyboardMapping = IWindowsKeyboardMapping | ILinuxKeyboardMapping | IMacKeyboardMapping;

    export function getKeyMap(): IKeyboardMapping;

    /* __GDPR__FRAGMENT__
        "IKeyboardLayoutInfo" : {
            "name" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
            "id": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
            "text": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
        }
    */
    export interface IWindowsKeyboardLayoutInfo {
        name: string;
        id: string;
        text: string;
    }

    /* __GDPR__FRAGMENT__
        "IKeyboardLayoutInfo" : {
            "model" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
            "layout": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
            "variant": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
            "options": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
            "rules": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
        }
    */
    export interface ILinuxKeyboardLayoutInfo {
        model: string;
        layout: string;
        variant: string;
        options: string;
        rules: string;
    }

    /* __GDPR__FRAGMENT__
        "IKeyboardLayoutInfo" : {
            "id" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
            "lang": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
        }
    */
    export interface IMacKeyboardLayoutInfo {
        id: string;
        lang: string;
    }

    export type IKeyboardLayoutInfo = IWindowsKeyboardLayoutInfo | ILinuxKeyboardLayoutInfo | IMacKeyboardLayoutInfo;

    export function getCurrentKeyboardLayout(): IKeyboardLayoutInfo;

    export function onDidChangeKeyboardLayout(callback: () => void): void;

    export function isISOKeyboard(): boolean;
}
