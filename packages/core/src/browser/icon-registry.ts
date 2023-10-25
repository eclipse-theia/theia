// *****************************************************************************
// Copyright (C) 2023 Ericsson and others.
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
// code copied and modified from https://github.com/Microsoft/vscode/blob/main/src/vs/platform/theme/common/iconRegistry.ts

import { injectable } from 'inversify';
import { Emitter } from '../common/event';
import { URI } from 'vscode-uri';

export interface IconDefinition {
    font?: IconFontContribution;
    fontCharacter: string;
}

export interface IconContribution {
    readonly id: string;
    description: string | undefined;
    deprecationMessage?: string;
    readonly defaults: ThemeIcon | IconDefinition;
}

export interface IconFontContribution {
    readonly id: string;
    readonly definition: IconFontDefinition;
}

export interface IconFontDefinition {
    readonly weight?: string;
    readonly style?: string;
    readonly src: IconFontSource[];
}

export interface IconFontSource {
    readonly location: URI;
    readonly format: string;
}

export interface ThemeIcon {
    readonly id: string;
    readonly color?: ThemeColor;
}

export interface ThemeColor {
    id: string;
}

@injectable()
export abstract class IconRegistry {
    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange = this.onDidChangeEmitter.event;

    protected fireDidChange(): void {
        this.onDidChangeEmitter.fire(undefined);
    }

    abstract registerIcon(id: string, defaults: ThemeIcon | IconDefinition, description?: string): ThemeIcon;
    abstract deregisterIcon(id: string): void;
    abstract getIconFont(id: string): IconFontDefinition | undefined;
}

