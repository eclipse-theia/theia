// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';
import { CHAT_VIEW_ALLOWED_RESOURCE_URLS, ChatViewPreferences } from '../chat-view-preferences';
import { setAllowedResourceUrls } from './block-external-resources';

/**
 * Keeps the resource allowlist used by {@link blockExternalResources} in sync with the
 * `ai-features.chat.allowedResourceUrls` preference.
 */
@injectable()
export class ExternalResourceAllowlistContribution implements FrontendApplicationContribution {

    @inject(ChatViewPreferences)
    protected readonly preferences: ChatViewPreferences;

    onStart(): void {
        this.preferences.ready.then(() => {
            setAllowedResourceUrls(this.preferences[CHAT_VIEW_ALLOWED_RESOURCE_URLS] ?? []);
        });
        this.preferences.onPreferenceChanged(event => {
            if (event.preferenceName === CHAT_VIEW_ALLOWED_RESOURCE_URLS) {
                setAllowedResourceUrls(this.preferences[CHAT_VIEW_ALLOWED_RESOURCE_URLS] ?? []);
            }
        });
    }
}
