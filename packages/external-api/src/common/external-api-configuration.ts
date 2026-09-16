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

import { ExternalApiDelivery } from './external-api-preferences';

/** RPC path on which frontends push the external API configuration to the backend. */
export const EXTERNAL_API_CONFIG_SERVICE_PATH = '/services/external-api-config';

/**
 * Configuration of the external API server, derived from the external API preferences.
 */
export interface ExternalApiServerConfig {
    /** Whether and how the external API is served. */
    delivery: ExternalApiDelivery;
    /** Port to serve the external API on. Only used with `separatePort` delivery. */
    port: number;
    /** Hostname or IP address to bind the server to. Only used with `separatePort` delivery. */
    hostname: string;
    /**
     * Bearer token required on protected external API routes.
     * When `undefined`, all routes are served without verification.
     */
    token?: string;
}

export const ExternalApiConfigService = Symbol('ExternalApiConfigService');
/**
 * Backend service receiving the external API configuration from the frontend preferences.
 */
export interface ExternalApiConfigService {
    updateConfig(config: ExternalApiServerConfig): Promise<void>;
}
