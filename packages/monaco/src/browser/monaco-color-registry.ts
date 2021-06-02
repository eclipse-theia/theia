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

import { injectable } from '@theia/core/shared/inversify';
import { ColorRegistry, ColorDefinition, Color } from '@theia/core/lib/browser/color-registry';
import { Disposable } from '@theia/core/lib/common/disposable';

@injectable()
export class MonacoColorRegistry extends ColorRegistry {

    protected readonly monacoThemeService = monaco.services.StaticServices.standaloneThemeService.get();
    protected readonly monacoColorRegistry = monaco.color.getColorRegistry();

    *getColors(): IterableIterator<string> {
        for (const { id } of this.monacoColorRegistry.getColors()) {
            yield id;
        }
    }

    getCurrentColor(id: string): string | undefined {
        const color = this.monacoThemeService.getTheme().getColor(id);
        return color && color.toString();
    }

    protected doRegister(definition: ColorDefinition): Disposable {
        let defaults: monaco.color.ColorDefaults | undefined;
        if (definition.defaults) {
            defaults = {};
            defaults.dark = this.toColor(definition.defaults.dark);
            defaults.light = this.toColor(definition.defaults.light);
            defaults.hc = this.toColor(definition.defaults.hc);
        }
        const identifier = this.monacoColorRegistry.registerColor(definition.id, defaults, definition.description);
        return Disposable.create(() => this.monacoColorRegistry.deregisterColor(identifier));
    }

    protected toColor(value: Color | undefined): monaco.color.ColorValue | undefined {
        if (!value || typeof value === 'string') {
            return value;
        }
        if ('kind' in value) {
            return monaco.color[value.kind](value.v, value.f);
        } else if ('r' in value) {
            const { r, g, b, a } = value;
            return new monaco.color.Color(new monaco.color.RGBA(r, g, b, a));
        } else {
            const { h, s, l, a } = value;
            return new monaco.color.Color(new monaco.color.HSLA(h, s, l, a));
        }
    }

}
