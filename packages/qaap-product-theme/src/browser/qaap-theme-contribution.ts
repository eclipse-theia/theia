// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { ThemeService } from '@theia/core/lib/browser/theming';

/**
 * Toggles `qaap-theme-light` / `qaap-theme-dark` on `document.body` when the
 * branded "Light (Qaap)" / "Dark (Qaap)" themes are active. All Qaap palette /
 * radius / shadow overrides live behind these classes in
 * `style/qaap-tokens.css`, so:
 *
 *  - Marketplace themes, High Contrast and any custom user theme keep their
 *    own colors untouched.
 *  - Switching from `Dark (Qaap)` to e.g. `One Dark Pro` cleanly removes the
 *    Qaap amber accent and warm hairlines, no leftovers.
 *
 * The Qaap built-in themes are registered by
 * {@link QaapBuiltinThemeBrandingContribution} with ids `light` / `dark`,
 * matching Theia's upstream BuiltinThemeProvider — that's what we match on.
 */
@injectable()
export class QaapThemeContribution implements FrontendApplicationContribution {

    /** Theme ids that should receive Qaap styling (kept in sync with the
     * `QaapBuiltinThemeBrandingContribution` registrations). */
    protected static readonly QAAP_THEME_IDS: ReadonlyMap<string, string> = new Map([
        ['light', 'qaap-theme-light'],
        ['dark', 'qaap-theme-dark']
    ]);

    @inject(ThemeService)
    protected readonly themeService: ThemeService;

    onStart(): void {
        this.applyClass(this.themeService.getCurrentTheme().id);
        this.themeService.onDidColorThemeChange(event => {
            this.applyClass(event.newTheme.id);
        });
    }

    protected applyClass(themeId: string): void {
        const body = document.body;
        // Clear any previous Qaap class so theme switches don't leave both on.
        for (const cssClass of QaapThemeContribution.QAAP_THEME_IDS.values()) {
            body.classList.remove(cssClass);
        }
        const next = QaapThemeContribution.QAAP_THEME_IDS.get(themeId);
        if (next) {
            body.classList.add(next);
        }
    }
}
