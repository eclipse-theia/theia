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

import { interfaces } from '@theia/core/shared/inversify';
import {
    MessageClient, MessageService,
    ProgressClient, ProgressService,
    bindContributionProvider
} from '@theia/core';
import { MainPluginApiProvider, PluginDeployerDirectoryHandler } from '@theia/plugin-ext';
import { PluginTheiaHeadlessDirectoryHandler } from './handlers/plugin-theia-headless-directory-handler';
import { HeadlessProgressClient } from './headless-progress-client';

export function bindHeadlessMain(bind: interfaces.Bind): void {
    bind(PluginDeployerDirectoryHandler).to(PluginTheiaHeadlessDirectoryHandler).inSingletonScope();
}

export function bindBackendMain(bind: interfaces.Bind, unbind: interfaces.Unbind, isBound: interfaces.IsBound, rebind: interfaces.Rebind): void {
    bindContributionProvider(bind, MainPluginApiProvider);

    //
    // Main API dependencies
    //

    bind(MessageService).toSelf().inSingletonScope();
    bind(MessageClient).toSelf().inSingletonScope(); // Just logs to console
    bind(ProgressService).toSelf().inSingletonScope();
    bind(ProgressClient).to(HeadlessProgressClient).inSingletonScope();
}
