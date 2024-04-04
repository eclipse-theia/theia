// *****************************************************************************
// Copyright (C) 2022 TypeFox and others.
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

import { inject, injectable, named } from 'inversify';
import { ContributionProvider } from '../common/contribution-provider';
import { Theme, ThemeType } from '../common/theme';
import { ColorRegistry } from './color-registry';
import { DecorationStyle } from './decoration-style';
import { FrontendApplicationContribution } from './frontend-application-contribution';
import { ThemeService } from './theming';
import { SecondaryWindowHandler } from './secondary-window-handler';

export const StylingParticipant = Symbol('StylingParticipant');

export interface StylingParticipant {
    registerThemeStyle(theme: ColorTheme, collector: CssStyleCollector): void
}

export interface ColorTheme {
    type: ThemeType
    label: string
    getColor(color: string): string | undefined;
}

export interface CssStyleCollector {
    addRule(rule: string): void;
}

@injectable()
export class StylingService implements FrontendApplicationContribution {
    protected cssElements = new Map<Window, HTMLStyleElement>();

    @inject(ThemeService)
    protected readonly themeService: ThemeService;

    @inject(ColorRegistry)
    protected readonly colorRegistry: ColorRegistry;

    @inject(ContributionProvider) @named(StylingParticipant)
    protected readonly themingParticipants: ContributionProvider<StylingParticipant>;

    @inject(SecondaryWindowHandler)
    protected readonly secondaryWindowHandler: SecondaryWindowHandler;

    onStart(): void {
        this.registerWindow(window);
        this.secondaryWindowHandler.onWillAddWidget(([widget, window]) => {
            this.registerWindow(window);
        });
        this.secondaryWindowHandler.onWillRemoveWidget(([widget, window]) => {
            this.cssElements.delete(window);
        });

        this.themeService.onDidColorThemeChange(e => this.applyStylingToWindows(e.newTheme));
    }

    registerWindow(win: Window): void {
        const cssElement = DecorationStyle.createStyleElement('contributedColorTheme', win.document.head);
        this.cssElements.set(win, cssElement);
        this.applyStyling(this.themeService.getCurrentTheme(), cssElement);
    }

    protected applyStylingToWindows(theme: Theme): void {
        this.cssElements.forEach(cssElement => this.applyStyling(theme, cssElement));
    }

    protected applyStyling(theme: Theme, cssElement: HTMLStyleElement): void {
        const rules: string[] = [];
        const colorTheme: ColorTheme = {
            type: theme.type,
            label: theme.label,
            getColor: color => this.colorRegistry.getCurrentColor(color)
        };
        const styleCollector: CssStyleCollector = {
            addRule: rule => rules.push(rule)
        };
        for (const themingParticipant of this.themingParticipants.getContributions()) {
            themingParticipant.registerThemeStyle(colorTheme, styleCollector);
        }
        const fullCss = rules.join('\n');
        cssElement.innerText = fullCss;
    }
}
