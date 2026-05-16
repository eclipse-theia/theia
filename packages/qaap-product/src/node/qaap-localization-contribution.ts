// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import { LocalizationContribution, LocalizationRegistry } from '@theia/core/lib/node/i18n/localization-contribution';
import { QAAP_BRANDING_LOCALES, buildQaapBrandingOverlay } from './qaap-i18n-branding';

/** Merges Qaap-specific wording over core nls packs (registered after Theia). */
@injectable()
export class QaapLocalizationContribution implements LocalizationContribution {

    async registerLocalizations(registry: LocalizationRegistry): Promise<void> {
        for (const languageId of QAAP_BRANDING_LOCALES) {
            registry.registerLocalization({
                languageId,
                getTranslations: () => buildQaapBrandingOverlay(languageId)
            });
        }
    }
}
