// *****************************************************************************
// Copyright (C) 2019 TypeFox and others.
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

import { injectable } from 'inversify';
import { DisposableCollection, Disposable } from '../common/disposable';
import { Emitter } from '../common/event';
import { ColorDefinition, ColorCssVariable } from '../common/color';

@injectable()
export class ColorRegistry {

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange = this.onDidChangeEmitter.event;
    protected fireDidChange(): void {
        this.onDidChangeEmitter.fire(undefined);
    }

    *getColors(): IterableIterator<string> { }

    getCurrentCssVariable(id: string): ColorCssVariable | undefined {
        const value = this.getCurrentColor(id);
        if (!value) {
            return undefined;
        }
        const name = this.toCssVariableName(id);
        return { name, value };
    }

    /**
     * All CSS variables to set for the given color: the primary one from {@link getCurrentCssVariable} and the
     * `--vscode-` prefixed alias. VS Code extensions reference colors with the `--vscode-` prefix, e.g. in the
     * inline styles of the HTML they render, and Monaco only defines those variables within its own containers.
     */
    getCurrentCssVariables(id: string): ColorCssVariable[] {
        const variable = this.getCurrentCssVariable(id);
        if (!variable) {
            return [];
        }
        return [variable, { name: this.toCssVariableName(id, 'vscode'), value: variable.value }];
    }

    toCssVariableName(id: string, prefix = 'theia'): string {
        return `--${prefix}-${id.replace(/\./g, '-')}`;
    }

    getCurrentColor(id: string): string | undefined {
        return undefined;
    }

    register(...definitions: ColorDefinition[]): Disposable {
        const result = new DisposableCollection(...definitions.map(definition => this.doRegister(definition)));
        this.fireDidChange();
        return result;
    }

    protected doRegister(definition: ColorDefinition): Disposable {
        return Disposable.NULL;
    }

}
