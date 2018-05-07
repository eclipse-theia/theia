/**
 * Copyright (C) 2018 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from 'inversify';
import { FrontendApplicationContribution } from "@theia/core/lib/browser";
import { ThemeService } from '@theia/core/lib/browser/theming';

@injectable()
export class MonacoFrontendApplicationContribution implements FrontendApplicationContribution {

    @inject(ThemeService)
    protected readonly themeService: ThemeService;

    async initialize() {
        await this.themeService.ready;
        const currentTheme = this.themeService.getCurrentTheme();
        this.changeTheme(currentTheme.editorTheme);
        this.themeService.onThemeChange(event => this.changeTheme(event.newTheme.editorTheme));
    }

    protected changeTheme(editorTheme: string | undefined) {
        const monacoTheme = editorTheme || this.themeService.defaultTheme;
        monaco.editor.setTheme(monacoTheme);
        document.body.classList.add(monacoTheme);
    }
}
