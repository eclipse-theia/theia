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

import { Event } from '@theia/core';

export const COPILOT_AUTH_SERVICE_PATH = '/services/copilot/auth';
export const CopilotAuthService = Symbol('CopilotAuthService');
export const CopilotAuthServiceClient = Symbol('CopilotAuthServiceClient');

/**
 * Response from GitHub's device code endpoint.
 */
export interface DeviceCodeResponse {
    /** URL where user should enter the code (e.g., https://github.com/login/device) */
    verification_uri: string;
    /** Code to display to the user (e.g., XXXX-XXXX) */
    user_code: string;
    /** Device code used for polling */
    device_code: string;
    /** Polling interval in seconds */
    interval: number;
    /** Expiration time in seconds */
    expires_in: number;
}

/**
 * Current authentication state.
 */
export interface CopilotAuthState {
    /** Whether the user is authenticated */
    isAuthenticated: boolean;
    /** GitHub username if authenticated */
    accountLabel?: string;
    /** GitHub Enterprise URL if using enterprise */
    enterpriseUrl?: string;
}

/**
 * Client interface for receiving auth state change notifications.
 */
export interface CopilotAuthServiceClient {
    onAuthStateChanged(state: CopilotAuthState): void;
}

/**
 * Service for handling GitHub Copilot OAuth Device Flow authentication.
 */
export interface CopilotAuthService {
    /**
     * Initiates the OAuth Device Flow.
     * Returns device code information for the UI to display.
     * @param enterpriseUrl Optional GitHub Enterprise domain
     */
    initiateDeviceFlow(enterpriseUrl?: string): Promise<DeviceCodeResponse>;

    /**
     * Polls for the access token after user authorizes.
     * @param deviceCode The device code from initiateDeviceFlow
     * @param interval Polling interval in seconds
     * @param enterpriseUrl Optional GitHub Enterprise domain
     * @returns true if authentication succeeded, false if expired/denied
     */
    pollForToken(deviceCode: string, interval: number, enterpriseUrl?: string): Promise<boolean>;

    /**
     * Get the current authentication state.
     */
    getAuthState(): Promise<CopilotAuthState>;

    /**
     * Get the access token for API calls.
     * @returns The access token or undefined if not authenticated
     */
    getAccessToken(): Promise<string | undefined>;

    /**
     * Sign out and clear stored credentials.
     */
    signOut(): Promise<void>;

    /**
     * Set the client to receive auth state change notifications.
     */
    setClient(client: CopilotAuthServiceClient | undefined): void;

    /**
     * Event fired when authentication state changes.
     */
    readonly onAuthStateChanged: Event<CopilotAuthState>;
}
