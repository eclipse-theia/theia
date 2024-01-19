// *****************************************************************************
// Copyright (C) 2024 EclipseSource and others.
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

import { createProxyIdentifier } from '@theia/plugin-ext/lib/common/rpc-protocol';
import { AbstractPluginManagerExt, EnvInit } from '@theia/plugin-ext';
import { KeysToKeysToAnyValue } from '@theia/plugin-ext/lib/common/types';
import {
    MAIN_RPC_CONTEXT, PLUGIN_RPC_CONTEXT
} from '@theia/plugin-ext/lib/common/plugin-api-rpc';
import { ExtPluginApi } from './plugin-ext-headless-api-contribution';

export const HEADLESSPLUGIN_RPC_CONTEXT = {
    MESSAGE_REGISTRY_MAIN: PLUGIN_RPC_CONTEXT.MESSAGE_REGISTRY_MAIN,
    ENV_MAIN: PLUGIN_RPC_CONTEXT.ENV_MAIN,
    NOTIFICATION_MAIN: PLUGIN_RPC_CONTEXT.NOTIFICATION_MAIN,
    LOCALIZATION_MAIN: PLUGIN_RPC_CONTEXT.LOCALIZATION_MAIN,
};

export const HEADLESSMAIN_RPC_CONTEXT = {
    HOSTED_PLUGIN_MANAGER_EXT: createProxyIdentifier<HeadlessPluginManagerExt>('HeadlessPluginManagerExt'),
    NOTIFICATION_EXT: MAIN_RPC_CONTEXT.NOTIFICATION_EXT,
};

export type HeadlessEnvInit = Pick<EnvInit, 'language' | 'shell' | 'appName' | 'appHost'>;

export interface HeadlessPluginManagerInitializeParams {
    activationEvents: string[];
    globalState: KeysToKeysToAnyValue;
    env: HeadlessEnvInit;
    extApi?: ExtPluginApi[];
}

export interface HeadlessPluginManagerExt extends AbstractPluginManagerExt<HeadlessPluginManagerInitializeParams> { }
