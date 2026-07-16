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

import { ILogger, PreferenceService } from '@theia/core';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { ExternalApiConfigService } from '../common/external-api-configuration';
import {
    EXTERNAL_API_DEFAULT_HOSTNAME,
    EXTERNAL_API_DELIVERY_PREF,
    EXTERNAL_API_HOSTNAME_PREF,
    EXTERNAL_API_PORT_PREF,
    EXTERNAL_API_TOKEN_PREF,
    ExternalApiDelivery
} from '../common/external-api-preferences';

/**
 * Pushes the external API preferences to the backend, initially and on every change,
 * so that the backend can start, reconfigure, or stop the external API server.
 */
@injectable()
export class ExternalApiFrontendContribution implements FrontendApplicationContribution {

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    @inject(ExternalApiConfigService)
    protected readonly configService: ExternalApiConfigService;

    @inject(ILogger) @named('external-api:ExternalApiFrontendContribution')
    protected readonly logger: ILogger;

    onStart(): void {
        this.preferenceService.ready.then(() => {
            this.pushConfig();
            this.preferenceService.onPreferenceChanged(event => {
                if (event.preferenceName.startsWith('externalApi.')) {
                    this.pushConfig();
                }
            });
        });
    }

    protected pushConfig(): void {
        this.configService.updateConfig({
            delivery: this.preferenceService.get<ExternalApiDelivery>(EXTERNAL_API_DELIVERY_PREF, 'off'),
            port: this.preferenceService.get<number>(EXTERNAL_API_PORT_PREF, 0),
            hostname: this.preferenceService.get<string>(EXTERNAL_API_HOSTNAME_PREF, EXTERNAL_API_DEFAULT_HOSTNAME),
            token: this.preferenceService.get<string>(EXTERNAL_API_TOKEN_PREF, '') || undefined
        }).catch(error => this.logger.error('Failed to push the external API configuration to the backend.', error));
    }
}
