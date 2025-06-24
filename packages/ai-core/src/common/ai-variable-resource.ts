// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH and others.
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

import * as deepEqual from 'fast-deep-equal';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { Resource, URI, generateUuid } from '@theia/core';
import { AIVariableContext, AIVariableResolutionRequest } from './variable-service';
import stableJsonStringify = require('fast-json-stable-stringify');
import { ConfigurableInMemoryResources, ConfigurableMutableReferenceResource } from './configurable-in-memory-resources';

export const AI_VARIABLE_RESOURCE_SCHEME = 'ai-variable';
export const NO_CONTEXT_AUTHORITY = 'context-free';

@injectable()
export class AIVariableResourceResolver {
    @inject(ConfigurableInMemoryResources) protected readonly inMemoryResources: ConfigurableInMemoryResources;

    @postConstruct()
    protected init(): void {
        this.inMemoryResources.onWillDispose(resource => this.cache.delete(resource.uri.toString()));
    }

    protected readonly cache = new Map<string, [Resource, AIVariableContext]>();

    getOrCreate(request: AIVariableResolutionRequest, context: AIVariableContext, value: string): ConfigurableMutableReferenceResource {
        const uri = this.toUri(request, context);
        try {
            const existing = this.inMemoryResources.resolve(uri);
            existing.update({ contents: value });
            return existing;
        } catch { /* No-op */ }
        const fresh = this.inMemoryResources.add(uri, { contents: value, readOnly: true, initiallyDirty: false });
        const key = uri.toString();
        this.cache.set(key, [fresh, context]);
        return fresh;
    }

    protected toUri(request: AIVariableResolutionRequest, context: AIVariableContext): URI {
        return URI.fromComponents({
            scheme: AI_VARIABLE_RESOURCE_SCHEME,
            query: stableJsonStringify({ arg: request.arg, name: request.variable.name }),
            path: '/',
            authority: this.toAuthority(context),
            fragment: ''
        });
    }

    protected toAuthority(context: AIVariableContext): string {
        try {
            if (deepEqual(context, {})) { return NO_CONTEXT_AUTHORITY; }
            for (const [resource, cachedContext] of this.cache.values()) {
                if (deepEqual(context, cachedContext)) {
                    return resource.uri.authority;
                }
            }
        } catch (err) {
            // Mostly that deep equal could overflow the stack, but it should run into === or inequality before that.
            console.warn('Problem evaluating context in AIVariableResourceResolver', err);
        }
        return generateUuid();
    }

    fromUri(uri: URI): { variableName: string, arg: string | undefined } | undefined {
        if (uri.scheme !== AI_VARIABLE_RESOURCE_SCHEME) { return undefined; }
        try {
            const { name: variableName, arg } = JSON.parse(uri.query);
            return variableName ? {
                variableName,
                arg,
            } : undefined;
        } catch { return undefined; }
    }
}
