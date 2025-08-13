// *****************************************************************************
// Copyright (C) 2025 STMicroelectronics and others.
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
import { nls, PreferenceContribution, PreferenceSchema, PreferenceSchemaService, PreferenceScope } from '@theia/core';
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';

const schema: PreferenceSchema = {
    properties: {
        'webview.warnIfUnsecure': {
            scope: PreferenceScope.Default,
            type: 'boolean',
            description: nls.localize('theia/plugin-ext/webviewWarnIfUnsecure', 'Warns users that webviews are currently deployed insecurely.'),
            default: true,

        }
    }
};

export class WebviewFrontendPreferenceContribution implements PreferenceContribution {
    async initSchema(service: PreferenceSchemaService): Promise<void> {
        const frontendConfig = FrontendApplicationConfigProvider.get();
        if (frontendConfig.securityWarnings) {
            service.addSchema(schema);
        }
    }
};
