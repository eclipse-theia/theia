// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { nls } from '@theia/core/lib/common/nls';
import { PreferenceContribution, PreferenceSchema } from '@theia/core/lib/common/preferences';
import { injectable } from '@theia/core/shared/inversify';

export const QAAP_MOBILE_APP_TESTER_AFTER_PREVIEW_PREF = 'qaap.mobile.appTesterAfterPreview';

export const qaapMobileAppPreferenceSchema: PreferenceSchema = {
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

@injectable()
export class QaapMobileAppPreferenceContribution implements PreferenceContribution {
    readonly schema = qaapMobileAppPreferenceSchema;
}
