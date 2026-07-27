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

import { nls, PreferenceSchema, PreferenceScope } from '@theia/core';

export const EXTERNAL_API_DELIVERY_PREF = 'externalApi.delivery';
export const EXTERNAL_API_PORT_PREF = 'externalApi.port';
export const EXTERNAL_API_HOSTNAME_PREF = 'externalApi.hostname';
export const EXTERNAL_API_TOKEN_PREF = 'externalApi.token';

export const EXTERNAL_API_DEFAULT_HOSTNAME = 'localhost';

/** How the external API is delivered. */
export type ExternalApiDelivery = 'off' | 'samePort' | 'separatePort';

/**
 * Creates the external API preference schema. The preferences configure the backend and
 * therefore apply per user: their maximum scope is {@link PreferenceScope.User}, so they
 * cannot be overridden in workspace settings.
 *
 * @param backendPort the port of the backend serving this frontend, if known.
 *  It is shown in the description of the `samePort` delivery option.
 */
export function createExternalApiPreferenceSchema(backendPort?: string): PreferenceSchema {
    const samePortDescription = backendPort
        ? nls.localize('theia/external-api/delivery/samePortKnown', 'Serve the external API on the same port as the backend (currently {0}).', backendPort)
        : nls.localize('theia/external-api/delivery/samePort', 'Serve the external API on the same port as the backend.');
    return {
        properties: {
            [EXTERNAL_API_DELIVERY_PREF]: {
                type: 'string',
                enum: ['off', 'samePort', 'separatePort'],
                enumItemLabels: [
                    nls.localizeByDefault('Off'),
                    nls.localize('theia/external-api/delivery/samePortLabel', 'Same port as backend'),
                    nls.localize('theia/external-api/delivery/separatePortLabel', 'Separate port')
                ],
                enumDescriptions: [
                    nls.localize('theia/external-api/delivery/off', 'Do not serve the external API.'),
                    samePortDescription,
                    nls.localize('theia/external-api/delivery/separatePort', 'Serve the external API on a dedicated port, configured via "externalApi.port".')
                ],
                default: 'off',
                scope: PreferenceScope.User,
                description: nls.localize('theia/external-api/delivery/description',
                    'Controls whether and how the external HTTP API is served.')
            },
            [EXTERNAL_API_PORT_PREF]: {
                type: 'number',
                minimum: 0,
                maximum: 65535,
                default: 0,
                scope: PreferenceScope.User,
                description: nls.localize('theia/external-api/port/description',
                    'Port on which the external HTTP API is served. Only used when "externalApi.delivery" is set to "separatePort".')
            },
            [EXTERNAL_API_HOSTNAME_PREF]: {
                type: 'string',
                default: EXTERNAL_API_DEFAULT_HOSTNAME,
                scope: PreferenceScope.User,
                description: nls.localize('theia/external-api/hostname/description',
                    'Hostname or IP address the external HTTP API server binds to. Use "0.0.0.0" to accept remote connections. \
Only used when "externalApi.delivery" is set to "separatePort".')
            },
            [EXTERNAL_API_TOKEN_PREF]: {
                type: 'string',
                default: '',
                scope: PreferenceScope.User,
                description: nls.localize('theia/external-api/token/description',
                    'Bearer token required to access protected external API endpoints ("Authorization: Bearer <token>"). \
When empty, the external API is served without verification.')
            }
        }
    };
}
