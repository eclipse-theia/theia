/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from 'inversify';
import { CommandRegistry, CommandContribution, CommandHandler, Command } from '../common/command';
import { QuickOpenService } from './quick-open/quick-open-service';
import { QuickOpenModel, QuickOpenItem, QuickOpenMode } from './quick-open/quick-open-model';
import { Emitter, Event } from '../common/event';

const dark = require('../../src/browser/style/variables-dark.useable.css');
const light = require('../../src/browser/style/variables-bright.useable.css');

export interface Theme {
    id: string;
    label: string;
    description?: string;
    editorTheme?: string;
    activate(): void;
    deactivate(): void;
}

export interface ThemeChangeEvent {
    newTheme: Theme;
    oldTheme?: Theme;
}

const darkTheme: Theme = {
    id: 'dark',
    label: 'Dark Theme',
    description: 'Bright fonts on dark backgrounds.',
    editorTheme: 'vs-dark',
    activate() {
        dark.use();
    },
    deactivate() {
        dark.unuse();
    }
};

const lightTheme: Theme = {
    id: 'light',
    label: 'Light Theme',
    description: 'Dark fonts on light backgrounds.',
    editorTheme: 'vs',
    activate() {
        light.use();
    },
    deactivate() {
        light.unuse();
    }
};

export class ThemeService {

    private themes: { [id: string]: Theme } = {};
    private activeTheme: Theme | undefined;
    private readonly themeChange = new Emitter<ThemeChangeEvent>();
    public readonly onThemeChange: Event<ThemeChangeEvent> = this.themeChange.event;

    protected constructor(private defaultTheme: string) { }

    register(theme: Theme) {
        this.themes[theme.id] = theme;
    }

    getThemes(): Theme[] {
        const result = [];
        for (const o in this.themes) {
            if (this.themes.hasOwnProperty(o)) {
                result.push(this.themes[o]);
            }
        }
        return result;
    }

    setCurrentTheme(themeId: string) {
        const newTheme = this.themes[themeId] || this.themes[this.defaultTheme];
        const oldTheme = this.activeTheme;
        if (oldTheme) {
            oldTheme.deactivate();
        }
        newTheme.activate();
        this.activeTheme = newTheme;
        this.themeChange.fire({
            newTheme, oldTheme
        });
        window.localStorage.setItem('theme', themeId);
    }

    getCurrentTheme(): Theme {
        const themeId = window.localStorage.getItem('theme') || this.defaultTheme;
        return this.themes[themeId] || this.themes[this.defaultTheme];
    }

    static get() {
        // tslint:disable-next-line:no-any
        const wnd = window as any;
        if (!wnd.__themeService) {
            const themeService = new ThemeService('dark');
            wnd.__themeService = themeService;
        }
        return wnd.__themeService as ThemeService;
    }
}
ThemeService.get().register(darkTheme);
ThemeService.get().register(lightTheme);

@injectable()
export class ThemingCommandContribution implements CommandContribution, CommandHandler, Command, QuickOpenModel {

    id = 'change_theme';
    label = 'Change Color Theme';
    private resetTo: string | undefined;
    private themeService = ThemeService.get();

    constructor( @inject(QuickOpenService) protected openService: QuickOpenService) { }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(this, this);
    }

    execute() {
        this.resetTo = this.themeService.getCurrentTheme().id;
        this.openService.open(this, {
            placeholder: 'Select Color Theme (Up/Down Keys to Preview)',
            fuzzyMatchLabel: true,
            selectIndex: () => this.activeIndex(),
            onClose: () => {
                if (this.resetTo) {
                    this.themeService.setCurrentTheme(this.resetTo);
                }
            }
        });
    }

    private activeIndex() {
        const current = this.themeService.getCurrentTheme().id;
        const themes = this.themeService.getThemes();
        for (let i = 0; i < themes.length; i++) {
            if (themes[i].id === current) {
                return i;
            }
        }
        return -1;
    }

    onType(lookFor: string, acceptor: (items: QuickOpenItem[]) => void): void {
        const items = this.themeService.getThemes().map(t =>
            new QuickOpenItem({
                label: t.label,
                description: t.description,
                run: (mode: QuickOpenMode) => {
                    if (mode === QuickOpenMode.OPEN) {
                        this.resetTo = undefined;
                    }
                    this.themeService.setCurrentTheme(t.id);
                    return true;
                }
            }));
        acceptor(items);
    }
}
