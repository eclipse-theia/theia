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

import { MenuPath } from '@theia/core';
import { RegistryArtifactKind } from '../common/ai-registry-preferences';

export const AI_REGISTRY_ENTRY_CONTEXT_MENU: MenuPath = ['ai_registry_entry_context_menu'];

export namespace AIRegistryEntryContextMenu {
    export const AUTO_UPDATE = [...AI_REGISTRY_ENTRY_CONTEXT_MENU, '1_auto_update'];
    export const COPY = [...AI_REGISTRY_ENTRY_CONTEXT_MENU, '2_copy'];
    export const AUTO_UPDATE_SUBMENU = [...AUTO_UPDATE, 'auto_update_submenu'];
}

/**
 * The slice of a skill or MCP entry the shared gear context menu operates on, so the menu
 * commands stay agnostic of which artifact family they were invoked from.
 */
export interface RegistryEntryContext {
    readonly artifactKind: RegistryArtifactKind;
    /** The "Copy ID" payload: the registry identifier, or the local name for an unlinked artifact. */
    readonly copyableId: string | undefined;
    /** The override key, set only while the artifact is installed and linked to a registry entry. */
    readonly autoUpdateId: string | undefined;
}

export namespace RegistryEntryContext {
    export function is(arg: unknown): arg is RegistryEntryContext {
        return !!arg && typeof arg === 'object' && 'artifactKind' in arg && 'autoUpdateId' in arg;
    }
}
