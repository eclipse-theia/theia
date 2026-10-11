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
 * The device code flow information reported by the Copilot CLI for the UI to display.
 */
export interface DeviceCodeResponse {
    /** URL where user should enter the code (e.g., https://github.com/login/device) */
    verification_uri: string;
    /** Code to display to the user (e.g., XXXX-XXXX) */
    user_code: string;
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
    /**
     * True when the credentials of a previous version were found and discarded, so that the user can
     * be told why they have to sign in again.
     */
    migrationRequired?: boolean;
}

/**
 * Client interface for receiving auth state change notifications.
 */
export interface CopilotAuthServiceClient {
    onAuthStateChanged(state: CopilotAuthState): void;
}

/**
 * Service for signing the GitHub Copilot CLI in, which serves all Copilot requests.
 *
 * The sign-in is a device code flow that the CLI runs and polls itself. This service starts it and
 * reports its progress, so that it can be presented like any other device code flow.
 */
export interface CopilotAuthService {
    /**
     * Tells the backend where the Copilot CLI is, as configured by the user.
     *
     * The CLI is not shipped with the application and has to be found on the machine hosting the
     * backend, which cannot read the preferences of the user itself.
     * @param path Location of the CLI executable, or `undefined` to search for it
     */
    setExecutablePath(path: string | undefined): Promise<void>;

    /**
     * Starts the sign-in and resolves once the code the user has to enter is known.
     * @param enterpriseUrl Optional GitHub Enterprise domain
     */
    startSignIn(enterpriseUrl?: string): Promise<DeviceCodeResponse>;

    /**
     * Waits for the sign-in started by {@link startSignIn} to complete.
     * @returns true if the sign-in succeeded, false if it was denied or expired
     */
    waitForSignIn(): Promise<boolean>;

    /**
     * Aborts a sign-in that is still in progress, if any.
     */
    cancelSignIn(): Promise<void>;

    /**
     * Discards the stored credentials of this application.
     */
    signOut(): Promise<void>;

    /**
     * Get the current authentication state.
     */
    getAuthState(): Promise<CopilotAuthState>;

    /**
     * Set the client to receive auth state change notifications.
     */
    setClient(client: CopilotAuthServiceClient | undefined): void;

    /**
     * Event fired when authentication state changes.
     */
    readonly onAuthStateChanged: Event<CopilotAuthState>;
}
