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

import { interfaces } from '@theia/core/shared/inversify';
import {
    PreferenceProxy,
    PreferenceProxyOptions,
} from '@theia/core/lib/common/preferences/preference-proxy';
import { PreferenceService } from '@theia/core/lib/common/preferences/preference-service';
import { PreferenceSchema } from '@theia/core/lib/common/preferences/preference-schema';
import {
    InjectablePreferenceProxy,
    PreferenceProxyFactory,
    PreferenceProxySchema,
} from '@theia/core/lib/common/preferences/injectable-preference-proxy';

/**
 * Default service identifier used by AI preference binding helpers when the caller
 * does not specify one. Equal to the core `PreferenceService` symbol; exposed as a
 * constant so the default is easy to read at the call sites.
 */
export const DEFAULT_AI_PREFERENCE_SERVICE: interfaces.ServiceIdentifier<PreferenceService> = PreferenceService;

/**
 * Build a `createPreferenceProxy`-style preference proxy using the `PreferenceService`
 * resolved from the given service identifier. Intended to be used inside
 * `bindXyzPreferences` helpers so that callers can opt into a trust-aware
 * `PreferenceService` (e.g. `AIPreferenceService`) without knowing the wiring.
 *
 * @param ctx the inversify context from the enclosing `toDynamicValue`
 * @param preferenceServiceId the identifier to resolve the underlying `PreferenceService` from
 * @param factory the package-specific proxy factory (e.g. `createChatToolPreferences`)
 * @param schema the schema the proxy exposes
 */
export function createAIPreferenceProxy<T>(
    ctx: interfaces.Context,
    preferenceServiceId: interfaces.ServiceIdentifier<PreferenceService>,
    factory: (preferences: PreferenceService, schema: PreferenceSchema) => T,
    schema: PreferenceSchema,
): T {
    const preferences = ctx.container.get<PreferenceService>(preferenceServiceId);
    return factory(preferences, schema);
}

/**
 * Build an `InjectablePreferenceProxy`-style preference proxy (the ones produced by
 * `PreferenceProxyFactory`) wired to the `PreferenceService` resolved from the given
 * service identifier.
 *
 * When the identifier is the default `PreferenceService`, this is equivalent to
 * calling `PreferenceProxyFactory` directly. When a different identifier is passed,
 * a child container is created that shadows `PreferenceService` so the inner proxy
 * picks up the caller-supplied service.
 */
export function createAIInjectablePreferenceProxy<T>(
    ctx: interfaces.Context,
    preferenceServiceId: interfaces.ServiceIdentifier<PreferenceService>,
    schema: PreferenceSchema,
    options: PreferenceProxyOptions = {},
): PreferenceProxy<T> {
    if (preferenceServiceId === DEFAULT_AI_PREFERENCE_SERVICE) {
        const factory = ctx.container.get<PreferenceProxyFactory>(PreferenceProxyFactory);
        return factory<T>(schema, options);
    }
    const child = ctx.container.createChild();
    child.bind(PreferenceProxyOptions).toConstantValue(options);
    child.bind(PreferenceProxySchema).toConstantValue(() => schema);
    child.bind(PreferenceService).toService(preferenceServiceId);
    const handler = child.get(InjectablePreferenceProxy);
    return new Proxy(Object.create(null), handler) as PreferenceProxy<T>; // eslint-disable-line no-null/no-null
}
