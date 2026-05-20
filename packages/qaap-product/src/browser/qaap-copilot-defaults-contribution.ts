// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { PreferenceSchemaService } from '@theia/core/lib/common/preferences/preference-schema';
import { inject, injectable } from '@theia/core/shared/inversify';

/** Matches {@link @theia/ai-copilot} `COPILOT_ENABLED_PREF` without a compile-time dependency. */
export const QAAP_COPILOT_ENABLED_PREF = 'ai-features.copilot.enabled';

/**
 * Qaap ships its own agentic AI; built-in GitHub Copilot (Theia extension or status bar)
 * stays off unless the app or user explicitly enables it (e.g. after installing a Copilot VSX).
 */
@injectable()
export class QaapCopilotDefaultsContribution implements FrontendApplicationContribution {

    @inject(PreferenceSchemaService)
    protected readonly schemaService: PreferenceSchemaService;

    onStart(): void {
        const property = this.schemaService.getSchemaProperty(QAAP_COPILOT_ENABLED_PREF);
        if (!property) {
            return;
        }
        this.schemaService.updateSchemaProperty(QAAP_COPILOT_ENABLED_PREF, {
            ...property,
            default: false
        });
    }
}
