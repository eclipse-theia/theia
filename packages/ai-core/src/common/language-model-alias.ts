// *****************************************************************************
// Copyright (C) 2024-2025 EclipseSource GmbH.
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

/**
 * Represents an alias for a language model, allowing fallback and selection.
 */
export interface LanguageModelAlias {
    /**
     * The unique identifier for the alias.
     */
    id: string;
    /**
     * The list of default model IDs to use if no selectedModelId is set.
     * Ordered by priority: the first entry is the highest priority fallback.
     */
    defaultModelIds: string[];
    /**
     * The currently selected model ID, if any.
     */
    selectedModelId?: string;
}

export const LanguageModelAliasRegistry = Symbol('LanguageModelAliasRegistry');
/**
 * Registry for managing language model aliases.
 */
export interface LanguageModelAliasRegistry {
    /**
     * Event that is fired when the alias list changes.
     */
    onDidChange: Event<void>;
    /**
     * Add a new alias or update an existing one.
     */
    addAlias(alias: LanguageModelAlias): void;
    /**
     * Remove an alias by its id.
     */
    removeAlias(id: string): void;
    /**
     * Get all aliases.
     */
    getAliases(): LanguageModelAlias[];
    /**
     * Resolve an alias or model id to a prioritized list of model ids.
     * If the id is not an alias, returns [id].
     * If the alias exists and has a selectedModelId, returns [selectedModelId].
     * If the alias exists and has no selectedModelId, returns defaultModelIds.
     * If the alias does not exist, returns undefined.
     */
    resolveAlias(id: string): string[] | undefined;
}
