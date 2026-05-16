// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
import { IconTheme, IconThemeService } from '@theia/core/lib/browser/icon-theme-service';
import { nls } from '@theia/core/lib/common/nls';
import { PreferenceSchemaService } from '@theia/core/lib/common/preferences/preference-schema';
import { inject, injectable } from '@theia/core/shared/inversify';

const SECONDARY_WINDOW_KEY = 'window.secondaryWindow.defaultPositionAndSize';
const FILE_ICON_THEME_ID = 'theia-file-icons';

/** Product-neutral core preference labels without forking core-preferences.ts. */
@injectable()
export class QaapCorePreferenceBrandingContribution implements FrontendApplicationContribution {

    @inject(PreferenceSchemaService)
    protected readonly schemaService: PreferenceSchemaService;

    @inject(IconThemeService)
    protected readonly iconThemeService: IconThemeService;

    onStart(): void {
        this.brandSecondaryWindowDescriptions();
        if (!this.brandFileIconThemeLabel()) {
            const disposable = this.iconThemeService.onDidChange(() => {
                if (this.brandFileIconThemeLabel()) {
                    disposable.dispose();
                }
            });
        }
    }

    protected brandSecondaryWindowDescriptions(): void {
        const property = this.schemaService.getSchemaProperty(SECONDARY_WINDOW_KEY);
        if (!property?.enumDescriptions || property.enumDescriptions.length < 3) {
            return;
        }
        this.schemaService.updateSchemaProperty(SECONDARY_WINDOW_KEY, {
            ...property,
            enumDescriptions: [
                property.enumDescriptions[0],
                nls.localize(
                    'theia/core/secondaryWindow/halfWidth',
                    'The position and size of the extracted widget will be half the width of the running application window.'
                ),
                nls.localize(
                    'theia/core/secondaryWindow/fullSize',
                    'The position and size of the extracted widget will be the same as the running application window.'
                )
            ]
        });
    }

    protected brandFileIconThemeLabel(): boolean {
        const existing = this.iconThemeService.getDefinition(FILE_ICON_THEME_ID);
        if (!existing) {
            return false;
        }
        const theme = existing as IconTheme;
        this.iconThemeService.unregister(FILE_ICON_THEME_ID);
        const app = FrontendApplicationConfigProvider.get().applicationName;
        this.iconThemeService.register({
            id: theme.id,
            label: nls.localize('theia/core/workbenchIconTheme/fileIcons', 'File Icons ({0})', app),
            description: theme.description,
            hasFileIcons: theme.hasFileIcons,
            hasFolderIcons: theme.hasFolderIcons,
            hidesExplorerArrows: theme.hidesExplorerArrows,
            showLanguageModeIcons: theme.showLanguageModeIcons,
            activate: () => theme.activate()
        });
        return true;
    }
}
