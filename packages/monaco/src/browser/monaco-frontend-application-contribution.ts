/********************************************************************************
 * Copyright (C) 2018 Ericsson and others.
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

import { injectable, inject } from 'inversify';
import { FrontendApplicationContribution } from "@theia/core/lib/browser";
import { ThemeService } from '@theia/core/lib/browser/theming';

@injectable()
export class MonacoFrontendApplicationContribution implements FrontendApplicationContribution {

    @inject(ThemeService)
    protected readonly themeService: ThemeService;

    async initialize() {
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
