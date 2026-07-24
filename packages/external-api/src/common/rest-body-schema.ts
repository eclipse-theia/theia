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

import { IJSONSchema } from '@theia/core/lib/common/json-schema';

/**
 * A JSON Schema carrying the TypeScript type of the request bodies it accepts.
 *
 * Routes of the external API declaring a `RestBodySchema` get their request body validated
 * against the schema and the schema published in the OpenAPI document, while the carried
 * type flows into the route's handler and custom validation. The declaration of a schema
 * constant is the single place asserting that schema and type agree — the type is not
 * verified against the schema:
 *
 * ```ts
 * export const SCHEMA: RestBodySchema<MyRequest> = {
 *     type: 'object',
 *     required: ['text'],
 *     additionalProperties: false,
 *     properties: {
 *         text: { type: 'string', description: 'The text to process.' }
 *     }
 * };
 * ```
 */
export type RestBodySchema<B> = IJSONSchema & {
    /** Purely type-level marker carrying `B`; never present at runtime. */
    readonly __body?: B;
};
