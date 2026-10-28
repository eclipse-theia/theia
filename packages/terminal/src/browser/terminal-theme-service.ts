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

import { ITheme } from 'xterm';
import { injectable, inject } from '@theia/core/shared/inversify';
import { ColorRegistry } from '@theia/core/lib/browser/color-registry';
import { ThemeService } from '@theia/core/lib/browser/theming';
import { ThemeChangeEvent } from '@theia/core/lib/common/theme';
import { Emitter, Event } from '@theia/core';
import { terminalAnsiColorMap } from '../common/terminal-preferences';

@injectable()
export class TerminalThemeService {

    @inject(ColorRegistry) protected readonly colorRegistry: ColorRegistry;
    @inject(ThemeService) protected readonly themeService: ThemeService;

    protected readonly onDidChangeEmitter = new Emitter<ThemeChangeEvent>();
    protected appliedTheme: string | undefined;

    /**
     * Fires when the color theme changes, and when a change in the `ColorRegistry` changes the terminal colors.
     */
    get onDidChange(): Event<ThemeChangeEvent> {
        this.listenForChanges();
        return this.onDidChangeEmitter.event;
    }

    /**
     * Subscribes on first use rather than at construction, so that the theme listener runs after the one that applies
     * a new theme to Monaco, whose color registry the terminal colors are read from.
     */
    protected listenForChanges(): void {
        if (this.appliedTheme !== undefined) {
            return;
        }
        this.appliedTheme = JSON.stringify(this.theme);
        this.themeService.onDidColorThemeChange(event => {
            this.appliedTheme = JSON.stringify(this.theme);
            this.onDidChangeEmitter.fire(event);
        });
        // The registry fires on every register() call and assigning the xterm theme repaints the whole terminal,
        // so only fire when the resolved terminal colors change.
        this.colorRegistry.onDidChange(() => {
            const theme = JSON.stringify(this.theme);
            if (theme !== this.appliedTheme) {
                this.appliedTheme = theme;
                this.onDidChangeEmitter.fire({ newTheme: this.themeService.getCurrentTheme() });
            }
        });
    }

    get theme(): ITheme {
        const foregroundColor = this.colorRegistry.getCurrentColor('terminal.foreground');
        const backgroundColor = this.colorRegistry.getCurrentColor('terminal.background') || this.colorRegistry.getCurrentColor('panel.background');
        const cursorColor = this.colorRegistry.getCurrentColor('terminalCursor.foreground') || foregroundColor;
        const cursorAccentColor = this.colorRegistry.getCurrentColor('terminalCursor.background') || backgroundColor;
        const selectionBackgroundColor = this.colorRegistry.getCurrentColor('terminal.selectionBackground');
        const selectionInactiveBackground = this.colorRegistry.getCurrentColor('terminal.inactiveSelectionBackground');
        const selectionForegroundColor = this.colorRegistry.getCurrentColor('terminal.selectionForeground');

        const theme: ITheme = {
            background: backgroundColor,
            foreground: foregroundColor,
            cursor: cursorColor,
            cursorAccent: cursorAccentColor,
            selectionBackground: selectionBackgroundColor,
            selectionInactiveBackground: selectionInactiveBackground,
            selectionForeground: selectionForegroundColor
        };
        // eslint-disable-next-line guard-for-in
        for (const id in terminalAnsiColorMap) {
            const colorId = id.substring(13);
            const colorName = colorId.charAt(0).toLowerCase() + colorId.slice(1);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (theme as any)[colorName] = this.colorRegistry.getCurrentColor(id);
        }
        return theme;
    }

}
