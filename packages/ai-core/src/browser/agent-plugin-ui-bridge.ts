// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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

export interface InstalledAgentPluginInfo {
    /** Registry identifier, e.g. `io.github.acme/bigquery-data-analytics`. */
    pluginId: string;
    /** From the plugin manifest, falling back to the identifier. */
    name: string;
}

export const AgentPluginUiBridge = Symbol('AgentPluginUiBridge');
/**
 * Optional integration point implemented by `@theia/ai-registry`, so that packages which must not
 * depend on it can still label and reveal the Agent Plugin behind a skill or an MCP server: both
 * carry only its identifier.
 *
 * Nothing is bound by default. Consumers inject it `@optional()` and, when it is absent, hide every
 * Agent Plugin affordance - a product without `@theia/ai-registry` cannot install one anyway.
 */
export interface AgentPluginUiBridge {
    /** `undefined` means callers should render no provenance affordance, not a bare identifier. */
    getPlugin(pluginId: string): InstalledAgentPluginInfo | undefined;
    /** Resolves the qualifier a contributed skill root carries, which is not the plugin identifier. */
    getPluginByQualifier(qualifier: string): InstalledAgentPluginInfo | undefined;
    /** A no-op for an unknown identifier. */
    revealPlugin(pluginId: string): void;
    readonly onDidChange: Event<void>;
}
