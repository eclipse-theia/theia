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
import { Skill } from '../common/skill';

export const SkillRegistryUiBridge = Symbol('SkillRegistryUiBridge');
/**
 * Optional integration point implemented by `@theia/ai-registry`, so that packages which must not
 * depend on it can tell which skills it manages and reveal them in the registry. The counterpart of
 * {@link AgentPluginUiBridge} for skills installed or linked directly, rather than contributed by a
 * plugin.
 *
 * Nothing is bound by default. Consumers inject it `@optional()` and, when it is absent, hide every
 * registry affordance - a product without `@theia/ai-registry` has no registry to install from.
 */
export interface SkillRegistryUiBridge {
    /**
     * The registry entry `skill` was installed from or linked to, or `undefined` for a skill the
     * registry does not manage - a workspace skill, a configured directory, or one contributed by an
     * Agent Plugin. Takes the whole skill rather than its name: a name alone cannot tell a managed
     * skill from one of the same name in a directory the user controls.
     */
    getRegistryEntryId(skill: Skill): string | undefined;
    /** Reveals the entry in the registry UI. A no-op for a skill the registry does not manage. */
    revealSkill(skillId: string): void;
    readonly onDidChange: Event<void>;
}
