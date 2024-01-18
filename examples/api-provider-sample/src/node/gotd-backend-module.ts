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
import { ContainerModule } from '@theia/core/shared/inversify';
import { ExtPluginApiProvider } from '@theia/plugin-ext';
import { ExtPluginGotdApiProvider } from './ext-plugin-gotd-api-provider';
import { MainPluginApiProvider } from '@theia/plugin-ext/lib/common/plugin-ext-api-contribution';
import { GotdMainPluginApiProvider } from './gotd-main-plugin-provider';
import { GreetingMain } from '../common/plugin-api-rpc';
import { GreetingMainImpl } from './greeting-main-impl';

export default new ContainerModule(bind => {
    bind(Symbol.for(ExtPluginApiProvider)).to(ExtPluginGotdApiProvider).inSingletonScope();
    bind(MainPluginApiProvider).to(GotdMainPluginApiProvider).inSingletonScope();
    bind(GreetingMain).to(GreetingMainImpl).inSingletonScope();
});
