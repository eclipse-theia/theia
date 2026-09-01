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

import { AI_CORE_PREFERENCES_TITLE } from '@theia/ai-core/lib/common/ai-core-preferences';
import { nls, PreferenceSchema, PreferenceScope } from '@theia/core';

export const AUTO_UPDATE_PREF = 'ai-features.registry.autoUpdate';
export const AUTO_UPDATE_OVERRIDES_PREF = 'ai-features.registry.autoUpdateOverrides';

/** How registry-managed artifacts (skills, MCP servers, Agent Plugins) react to a newer registry entry. */
export type AutoUpdateMode = 'off' | 'ask' | 'on';

export const AUTO_UPDATE_MODES: readonly AutoUpdateMode[] = ['off', 'ask', 'on'];

export namespace AutoUpdateMode {
    export function is(value: unknown): value is AutoUpdateMode {
        return typeof value === 'string' && (AUTO_UPDATE_MODES as readonly string[]).includes(value);
    }
}

/** Artifact families the registry can auto-update. Namespaces the override keys. */
export type RegistryArtifactKind = 'skill' | 'mcp' | 'plugin';

/**
 * Both preferences are `User`-scoped on purpose: a workspace-settable policy would let a cloned
 * repository turn auto-update on and download skill content into `~/.agents/skills` at startup
 * without the user ever being asked.
 */
export const AIRegistryPreferencesSchema: PreferenceSchema = {
    properties: {
        [AUTO_UPDATE_PREF]: {
            type: 'string',
            enum: [...AUTO_UPDATE_MODES],
            default: 'ask',
            scope: PreferenceScope.User,
            enumDescriptions: [
                nls.localize('theia/ai-registry/autoUpdate/off',
                    'Never update installed skills, MCP servers and Agent Plugins, and never notify about available updates.'),
                nls.localize('theia/ai-registry/autoUpdate/ask', 'Notify when an update is available for an installed skill, MCP server or Agent Plugin.'),
                nls.localize('theia/ai-registry/autoUpdate/on', 'Update installed skills, MCP servers and Agent Plugins automatically.')
            ],
            description: nls.localize('theia/ai-registry/autoUpdate/description',
                'Default update behavior for skills, MCP servers and Agent Plugins installed from the AI registry. Updates are checked once per \
window load. Individual artifacts can override this from the gear menu in the Extensions view.'),
            title: AI_CORE_PREFERENCES_TITLE
        },
        [AUTO_UPDATE_OVERRIDES_PREF]: {
            type: 'object',
            default: {},
            scope: PreferenceScope.User,
            additionalProperties: {
                type: 'string',
                enum: [...AUTO_UPDATE_MODES]
            },
            markdownDescription: nls.localize('theia/ai-registry/autoUpdateOverrides/mdDescription',
                'Per-artifact overrides of `#ai-features.registry.autoUpdate#`, keyed by `skill:<skillId>`, `mcp:<serverId>` or \
`plugin:<pluginId>`. Entries are normally maintained through the gear menu in the Extensions view; an artifact without an entry follows \
the default.'),
            title: AI_CORE_PREFERENCES_TITLE
        }
    }
};
