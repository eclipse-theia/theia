// *****************************************************************************
// Copyright (C) 2017 TypeFox and others.
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

export type ThemeType = 'light' | 'dark' | 'hc' | 'hcLight';

export interface Theme {
    readonly id: string;
    readonly type: ThemeType;
    readonly label: string;
    readonly description?: string;
    readonly editorTheme?: string;
    activate?(): void;
    deactivate?(): void;
}

export function isHighContrast(scheme: ThemeType): boolean {
    return scheme === 'hc' || scheme === 'hcLight';
}

export interface ThemeChangeEvent {
    readonly newTheme: Theme;
    readonly oldTheme?: Theme;
}
