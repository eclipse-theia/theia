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

import { injectable } from '@theia/core/shared/inversify';

/**
 * Endpoint and tool identity for the AI registry integration.
 *
 * Defaults to the public Eclipse-hosted AI registry with tool name `'all'`. Products
 * that want a different registry or a tool-specific filter rebind this class in their
 * frontend module:
 *
 * ```ts
 * rebind(AIRegistryConfiguration).toConstantValue(new (class extends AIRegistryConfiguration {
 *     override getToolName(): string { return 'my-product'; }
 *     override getBaseUrl(): string { return 'https://internal.example/registry/'; }
 * })());
 * ```
 *
 * Values are intentionally not exposed as user preferences - a user must not be able
 * to redirect the IDE to a different registry URL or change the tool identity (both
 * are trust-relevant decisions).
 */
@injectable()
export class AIRegistryConfiguration {

    /**
     * Tool identifier used to scope which approvals apply. `'all'` is the safe default
     * for any Theia-based product; rebind this in product code to filter the registry
     * down to a tool-specific approval set.
     */
    getToolName(): string {
        return 'all';
    }

    getBaseUrl(): string {
        return 'https://eclipsefdn-ai-registry.github.io/ai-registry-core/api/v1/';
    }
}
