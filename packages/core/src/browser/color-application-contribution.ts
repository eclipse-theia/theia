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

import { injectable, inject, named } from 'inversify';
import { ColorRegistry } from './color-registry';
import { Emitter } from '../common/event';
import { ThemeService } from './theming';
import { FrontendApplicationContribution } from './frontend-application-contribution';
import { ContributionProvider } from '../common/contribution-provider';
import { Disposable, DisposableCollection } from '../common/disposable';
import { DEFAULT_BACKGROUND_COLOR_STORAGE_KEY } from './frontend-application-config-provider';
import { SecondaryWindowHandler } from './secondary-window-handler';

export const ColorContribution = Symbol('ColorContribution');
export interface ColorContribution {
    registerColors(colors: ColorRegistry): void;
}

@injectable()
export class ColorApplicationContribution implements FrontendApplicationContribution {

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange = this.onDidChangeEmitter.event;
    private readonly windows: Set<Window> = new Set();

    @inject(ColorRegistry)
    protected readonly colors: ColorRegistry;

    @inject(ContributionProvider) @named(ColorContribution)
    protected readonly colorContributions: ContributionProvider<ColorContribution>;

    @inject(ThemeService) protected readonly themeService: ThemeService;

    @inject(SecondaryWindowHandler)
    protected readonly secondaryWindowHandler: SecondaryWindowHandler;

    onStart(): void {
        for (const contribution of this.colorContributions.getContributions()) {
            contribution.registerColors(this.colors);
        }
        this.themeService.initialized.then(() => this.update());
        this.themeService.onDidColorThemeChange(() => {
            this.update();
            this.updateThemeBackground();
        });
        this.colors.onDidChange(() => this.update());

        this.registerWindow(window);
        this.secondaryWindowHandler.onWillAddWidget(([widget, window]) => {
            this.registerWindow(window);
        });
        this.secondaryWindowHandler.onWillRemoveWidget(([widget, window]) => {
            this.windows.delete(window);
        });
    }

    registerWindow(win: Window): void {
        this.windows.add(win);
        this.updateWindow(win);
        this.onDidChangeEmitter.fire();
    }

    protected readonly toUpdate = new DisposableCollection();
    protected update(): void {
        this.toUpdate.dispose();
        this.windows.forEach(win => this.updateWindow(win));
        this.onDidChangeEmitter.fire();
    }

    protected updateWindow(win: Window): void {
        const theme = 'theia-' + this.themeService.getCurrentTheme().type;

        win.document.body.classList.add(theme);
        this.toUpdate.push(Disposable.create(() => win.document.body.classList.remove(theme)));

        const documentElement = win.document.documentElement;
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
    }

    protected updateThemeBackground(): void {
        const color = this.colors.getCurrentColor('editor.background');
        if (color) {
            window.localStorage.setItem(DEFAULT_BACKGROUND_COLOR_STORAGE_KEY, color);
        } else {
            window.localStorage.removeItem(DEFAULT_BACKGROUND_COLOR_STORAGE_KEY);
        }
    }
}
