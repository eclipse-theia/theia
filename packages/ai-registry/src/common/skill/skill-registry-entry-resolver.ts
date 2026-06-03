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
import { RegistrySkill, ResolvedSkillEntry } from './skill-registry-types';

export const SkillRegistryEntryResolver = Symbol('SkillRegistryEntryResolver');
export interface SkillRegistryEntryResolver {
    /** Normalises a raw registry skill entry into the shape the install path uses, or undefined when it is not approved/usable. */
    resolve(raw: RegistrySkill): ResolvedSkillEntry | undefined;
}

@injectable()
export class SkillRegistryEntryResolverImpl implements SkillRegistryEntryResolver {

    resolve(raw: RegistrySkill): ResolvedSkillEntry | undefined {
        if (!raw.source?.url) {
            return undefined;
        }
        // A skill is only installable once at least one organization has approved it.
        if (!raw.approvals?.length) {
            return undefined;
        }
        return {
            skillId: raw.skillId,
            name: raw.name,
            description: raw.description,
            sourceUrl: raw.source.url,
            ...(raw.source.path !== undefined && { sourcePath: raw.source.path }),
            contentHash: raw.contentHash
        };
    }
}
