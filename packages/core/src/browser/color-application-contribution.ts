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

import { injectable, inject, named } from 'inversify';
import { ColorRegistry } from './color-registry';
import { Emitter } from '../common/event';
import { ThemeService } from './theming';
import { FrontendApplicationContribution } from './frontend-application';
import { ContributionProvider } from '../common/contribution-provider';
import { Disposable, DisposableCollection } from '../common/disposable';

export const ColorContribution = Symbol('ColorContribution');
export interface ColorContribution {
    registerColors(colors: ColorRegistry): void;
}

@injectable()
export class ColorApplicationContribution implements FrontendApplicationContribution {

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange = this.onDidChangeEmitter.event;

    @inject(ColorRegistry)
    protected readonly colors: ColorRegistry;

    @inject(ContributionProvider) @named(ColorContribution)
    protected readonly colorContributions: ContributionProvider<ColorContribution>;

    private static themeBackgroundId = 'theme.background';

    onStart(): void {
        for (const contribution of this.colorContributions.getContributions()) {
            contribution.registerColors(this.colors);
        }

        this.updateThemeBackground();
        ThemeService.get().onThemeChange(() => this.updateThemeBackground());

        this.update();
        ThemeService.get().onThemeChange(() => this.update());
        this.colors.onDidChange(() => this.update());
    }

    protected readonly toUpdate = new DisposableCollection();
    protected update(): void {
        if (!document) {
            return;
        }
        this.toUpdate.dispose();
        const theme = 'theia-' + ThemeService.get().getCurrentTheme().type;
        document.body.classList.add(theme);
        this.toUpdate.push(Disposable.create(() => document.body.classList.remove(theme)));

        const documentElement = document.documentElement;
        if (documentElement) {
            for (const id of this.colors.getColors()) {
                const variable = this.colors.getCurrentCssVariable(id);
                if (variable) {
                    const { name, value } = variable;
                    documentElement.style.setProperty(name, value);
                    this.toUpdate.push(Disposable.create(() => documentElement.style.removeProperty(name)));
                }
            }
        }
        this.onDidChangeEmitter.fire(undefined);
    }

    protected updateThemeBackground(): void {
        const color = this.colors.getCurrentColor('editor.background');
        if (color) {
            window.localStorage.setItem(ColorApplicationContribution.themeBackgroundId, color);
        } else {
            window.localStorage.removeItem(ColorApplicationContribution.themeBackgroundId);
        }
    }

    static initBackground(): void {
        const value = window.localStorage.getItem(this.themeBackgroundId) || '#1d1d1d';
        const documentElement = document.documentElement;
        documentElement.style.setProperty('--theia-editor-background', value);
    }

}
