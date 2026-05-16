// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
import { ThemeService } from '@theia/core/lib/browser/theming';
import { nls } from '@theia/core/lib/common/nls';

/** Re-label built-in color themes with the configured application name. */
@injectable()
export class QaapBuiltinThemeBrandingContribution implements FrontendApplicationContribution {

    @inject(ThemeService)
    protected readonly themeService: ThemeService;

    onStart(): void {
        const app = FrontendApplicationConfigProvider.get().applicationName;
        this.themeService.register(
            {
                id: 'dark',
                type: 'dark',
                label: nls.localize('theia/core/builtinTheme/dark', 'Dark ({0})', app),
                editorTheme: 'dark-theia'
            },
            {
                id: 'light',
                type: 'light',
                label: nls.localize('theia/core/builtinTheme/light', 'Light ({0})', app),
                editorTheme: 'light-theia'
            },
            {
                id: 'hc-theia',
                type: 'hc',
                label: nls.localize('theia/core/builtinTheme/highContrast', 'High Contrast ({0})', app),
                editorTheme: 'hc-theia'
            },
            {
                id: 'hc-theia-light',
                type: 'hcLight',
                label: nls.localize('theia/core/builtinTheme/highContrastLight', 'High Contrast Light ({0})', app),
                editorTheme: 'hc-theia-light'
            }
        );
    }
}
