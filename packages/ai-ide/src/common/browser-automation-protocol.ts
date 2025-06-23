// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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

export const browserAutomationPath = '/services/automation/browser';
export const BrowserAutomation = Symbol('BrowserAutomation');
export interface BrowserAutomation {
    launch(remoteDebuggingPort: number): Promise<LaunchResult | undefined>;
    isRunning(): Promise<boolean>;
    queryDom(selector?: string): Promise<string>;
    close(): Promise<void>;
}

export interface LaunchResult {
    remoteDebuggingPort: number;
}

export const BrowserAutomationClient = Symbol('BrowserAutomationClient');
export interface BrowserAutomationClient {
}
