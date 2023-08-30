// *****************************************************************************
// Copyright (C) 2019 TypeFox and others.
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

import { interfaces } from 'inversify';
import {
    bindContributionProvider, DefaultResourceProvider, MaybePromise, MessageClient,
    MessageService, ResourceProvider, ResourceResolver
} from '../common';
import {
    bindPreferenceSchemaProvider, PreferenceProvider,
    PreferenceProviderProvider, PreferenceProxyOptions, PreferenceSchema, PreferenceSchemaProvider, PreferenceScope,
    PreferenceService, PreferenceServiceImpl, PreferenceValidationService
} from './preferences';
import { InjectablePreferenceProxy, PreferenceProxyFactory, PreferenceProxySchema } from './preferences/injectable-preference-proxy';

export function bindMessageService(bind: interfaces.Bind): interfaces.BindingWhenOnSyntax<MessageService> {
    bind(MessageClient).toSelf().inSingletonScope();
    return bind(MessageService).toSelf().inSingletonScope();
}

export function bindPreferenceService(bind: interfaces.Bind): void {
    bind(PreferenceProvider).toSelf().inSingletonScope().whenTargetNamed(PreferenceScope.User);
    bind(PreferenceProvider).toSelf().inSingletonScope().whenTargetNamed(PreferenceScope.Workspace);
    bind(PreferenceProvider).toSelf().inSingletonScope().whenTargetNamed(PreferenceScope.Folder);
    bind(PreferenceProviderProvider).toFactory(ctx => (scope: PreferenceScope) => {
        if (scope === PreferenceScope.Default) {
            return ctx.container.get(PreferenceSchemaProvider);
        }
        return ctx.container.getNamed(PreferenceProvider, scope);
    });
    bind(PreferenceServiceImpl).toSelf().inSingletonScope();
    bind(PreferenceService).toService(PreferenceServiceImpl);
    bindPreferenceSchemaProvider(bind);
    bind(PreferenceValidationService).toSelf().inSingletonScope();
    bind(InjectablePreferenceProxy).toSelf();
    bind(PreferenceProxyFactory).toFactory(({ container }) => (schema: MaybePromise<PreferenceSchema>, options: PreferenceProxyOptions = {}) => {
        const child = container.createChild();
        child.bind(PreferenceProxyOptions).toConstantValue(options ?? {});
        child.bind(PreferenceProxySchema).toConstantValue(() => schema);
        const handler = child.get(InjectablePreferenceProxy);
        return new Proxy(Object.create(null), handler); // eslint-disable-line no-null/no-null
    });
}

export function bindResourceProvider(bind: interfaces.Bind): void {
    bind(DefaultResourceProvider).toSelf().inSingletonScope();
    bind(ResourceProvider).toProvider(context => uri => context.container.get(DefaultResourceProvider).get(uri));
    bindContributionProvider(bind, ResourceResolver);
}
