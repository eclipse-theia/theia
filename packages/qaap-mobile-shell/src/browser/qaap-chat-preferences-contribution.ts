// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import { PreferenceContribution, PreferenceSchema, PreferenceSchemaService } from '@theia/core/lib/common/preferences/preference-schema';
import { PreferenceScope } from '@theia/core/lib/common/preferences';
import { CHAT_VIEW_TOKEN_USAGE_ENABLED } from '@theia/ai-chat-ui/lib/browser/chat-view-preferences';

/** Qaap enables the chat context meter by default (upstream keeps it off as experimental). */
@injectable()
export class QaapChatPreferencesContribution implements PreferenceContribution {
    schema: PreferenceSchema = { scope: PreferenceScope.Folder, properties: {} };

    async initSchema(service: PreferenceSchemaService): Promise<void> {
        service.registerOverride(CHAT_VIEW_TOKEN_USAGE_ENABLED, undefined, true);
    }
}
