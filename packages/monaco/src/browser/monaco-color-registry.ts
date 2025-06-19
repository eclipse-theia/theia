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

import { injectable } from '@theia/core/shared/inversify';
import { ColorRegistry } from '@theia/core/lib/browser/color-registry';
import { Color, ColorDefaults as TheiaColorDefaults, ColorDefinition } from '@theia/core/lib/common/color';
import { Disposable } from '@theia/core/lib/common/disposable';
import { ColorDefaults, ColorValue, getColorRegistry } from '@theia/monaco-editor-core/esm/vs/platform/theme/common/colorRegistry';
import { StandaloneServices } from '@theia/monaco-editor-core/esm/vs/editor/standalone/browser/standaloneServices';
import { IStandaloneThemeService } from '@theia/monaco-editor-core/esm/vs/editor/standalone/common/standaloneTheme';
import { Color as MonacoColor, HSLA, RGBA } from '@theia/monaco-editor-core/esm/vs/base/common/color';
import * as Colors from '@theia/monaco-editor-core/esm/vs/platform/theme/common/colorRegistry';

@injectable()
export class MonacoColorRegistry extends ColorRegistry {

    protected readonly monacoThemeService = StandaloneServices.get(IStandaloneThemeService);
    protected readonly monacoColorRegistry = getColorRegistry();

    override *getColors(): IterableIterator<string> {
        for (const { id } of this.monacoColorRegistry.getColors()) {
            yield id;
        }
    }

    override getCurrentColor(id: string): string | undefined {
        return this.monacoThemeService.getColorTheme().getColor(id)?.toString();
    }

    getColor(id: string): MonacoColor | undefined {
        return this.monacoThemeService.getColorTheme().getColor(id);
    }

    protected override doRegister(definition: ColorDefinition): Disposable {
        const defaults: ColorDefaults = {
            dark: this.toColor(TheiaColorDefaults.getDark(definition.defaults)),
            light: this.toColor(TheiaColorDefaults.getLight(definition.defaults)),
            hcDark: this.toColor(TheiaColorDefaults.getHCDark(definition.defaults)),
            hcLight: this.toColor(TheiaColorDefaults.getHCLight(definition.defaults)),
        };
        const identifier = this.monacoColorRegistry.registerColor(definition.id, defaults, definition.description);
        return Disposable.create(() => this.monacoColorRegistry.deregisterColor(identifier));
    }

    protected toColor(value: Color | undefined): ColorValue | null {
        if (!value || typeof value === 'string') {
            return value ?? null; // eslint-disable-line no-null/no-null
        }
        if ('kind' in value) {
            return Colors[value.kind](value.v, value.f);
        } else if ('r' in value) {
            const { r, g, b, a } = value;
            return new MonacoColor(new RGBA(r, g, b, a));
        } else {
            const { h, s, l, a } = value;
            return new MonacoColor(new HSLA(h, s, l, a));
        }
    }

}
