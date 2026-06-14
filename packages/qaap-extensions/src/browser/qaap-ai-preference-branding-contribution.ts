// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { PreferenceContribution, PreferenceSchema } from '@theia/core/lib/common/preferences';
import { PreferenceDataProperty } from '@theia/core/lib/common/preferences';
import { PreferenceSchemaService } from '@theia/core/lib/common/preferences/preference-schema';
import { nls } from '@theia/core/lib/common/nls';
import { inject, injectable } from '@theia/core/shared/inversify';

export const QAAP_MOBILE_APP_TESTER_AFTER_PREVIEW_PREF = 'qaap.mobile.appTesterAfterPreview';

export const qaapAiPreferenceSchema: PreferenceSchema = {
    properties: {
        [QAAP_MOBILE_APP_TESTER_AFTER_PREVIEW_PREF]: {
            type: 'boolean',
            default: true,
            description: nls.localize(
                'qaap/preferences/appTesterAfterPreview',
                'On mobile, delegate a short UI smoke check to AppTester after the dev preview opens.'
            ),
        },
    },
};

const HOST_MACHINE_FROM = 'on the machine running Theia.';
const HOST_MACHINE_TO = 'on the machine running this application.';

/**
 * Provides the Qaap AI preference schema.
 *
 * Pure {@link PreferenceContribution}: it injects no services. Injecting `PreferenceSchemaService`
 * into a `PreferenceContribution` recurses infinitely — `PreferenceSchemaServiceImpl.init()`
 * collects every `PreferenceContribution`, so constructing one that depends back on the service
 * re-enters `init()`. The re-branding side that does need the service lives in
 * {@link QaapAiPreferenceBrandingStartup}.
 */
@injectable()
export class QaapAiPreferenceBrandingContribution implements PreferenceContribution {

    readonly schema = qaapAiPreferenceSchema;
}

/** Re-label API-key preference warnings without forking each AI provider package. */
@injectable()
export class QaapAiPreferenceBrandingStartup implements FrontendApplicationContribution {

    @inject(PreferenceSchemaService)
    protected readonly schemaService: PreferenceSchemaService;

    onStart(): void {
        for (const [key, property] of this.schemaService.getSchemaProperties()) {
            const branded = this.brandHostMachineWarning(property);
            if (branded) {
                this.schemaService.updateSchemaProperty(key, branded);
            }
        }
    }

    protected brandHostMachineWarning(property: PreferenceDataProperty): PreferenceDataProperty | undefined {
        let next = property;
        let changed = false;
        for (const field of ['markdownDescription', 'description'] as const) {
            const value = next[field];
            if (typeof value === 'string' && value.includes(HOST_MACHINE_FROM)) {
                next = { ...next, [field]: value.replaceAll(HOST_MACHINE_FROM, HOST_MACHINE_TO) };
                changed = true;
            }
        }
        return changed ? next : undefined;
    }
}
