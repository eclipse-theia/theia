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

import { ExternalApiRouter } from './external-api-router';

/**
 * Documentation of an {@link ExternalApiContribution}, grouping its routes in the OpenAPI
 * document of the external API.
 */
export interface ExternalApiContributionDocumentation {
    /** Title of the contribution, used as the OpenAPI tag of its routes. */
    title: string;
    /** Description of the contribution; CommonMark. */
    description?: string;
}

export const ExternalApiContribution = Symbol('ExternalApiContribution');
/**
 * Contributes HTTP endpoints to the external API server.
 *
 * Unlike {@link BackendApplicationContribution}s, which extend Theia's main HTTP server,
 * these endpoints are served on the dedicated, preference-configured external API port
 * and are intended for consumption by external tools.
 *
 * When an external API token is configured, contributions are protected by bearer token
 * verification unless they opt out via {@link unprotected}.
 */
export interface ExternalApiContribution {
    /**
     * Absolute path under which this contribution's routes are mounted, e.g. `/api/ai/sessions`.
     * The server imposes no path conventions.
     */
    readonly path: string;
    /**
     * Serve this contribution without token verification even when a token is configured.
     * Intended for endpoints with their own authentication or endpoints that are
     * conventionally public. Defaults to `false`.
     */
    readonly unprotected?: boolean;
    /**
     * Documentation of this contribution, grouping its routes under an OpenAPI tag in the
     * OpenAPI document of the external API.
     */
    readonly documentation?: ExternalApiContributionDocumentation;
    /**
     * Registers the contribution's routes, see {@link ExternalApiRouter}.
     *
     * Called whenever the routing is (re)built, i.e. when the external API server
     * configuration changes. The router of the previous build — including everything
     * registered in its `toDispose` collection — is disposed beforehand, so build-scoped
     * state is set up here rather than held across builds.
     */
    configure(router: ExternalApiRouter): void;
}
