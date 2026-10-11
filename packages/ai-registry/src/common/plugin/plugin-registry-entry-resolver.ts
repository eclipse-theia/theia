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

import { injectable } from '@theia/core/shared/inversify';
import { PluginEndorsement, RegistryPlugin, RegistryPluginApproval, ResolvedPluginEntry } from './plugin-registry-types';

// Narrower than what the feed might publish: the identifier is encoded into the directory name, and
// that name becomes the qualifier inside a `/`-command. Restricting it once here is what stops two
// identifiers encoding to one directory, and a qualifier containing a character the parser stops at.
const PLUGIN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/;

export const PluginRegistryEntryResolver = Symbol('PluginRegistryEntryResolver');
export interface PluginRegistryEntryResolver {
    /** Normalises a raw registry plugin entry into the shape the install path uses, or undefined when it is not approved/usable. */
    resolve(raw: RegistryPlugin): ResolvedPluginEntry | undefined;
}

@injectable()
export class PluginRegistryEntryResolverImpl implements PluginRegistryEntryResolver {

    resolve(raw: RegistryPlugin): ResolvedPluginEntry | undefined {
        if (!raw.source?.url) {
            return undefined;
        }
        // A plugin is only installable once at least one organization has endorsed it.
        if (!raw.approvals?.length) {
            return undefined;
        }
        if (!this.isUsablePluginId(raw.pluginId)) {
            return undefined;
        }
        const approvals = this.sortApprovals(raw.approvals);
        return {
            pluginId: raw.pluginId,
            name: raw.name,
            description: raw.description,
            ...(raw.version !== undefined && { version: raw.version }),
            sourceUrl: raw.source.url,
            ...(raw.source.path !== undefined && { sourcePath: raw.source.path }),
            contentHash: raw.contentHash,
            // Every endorsing organization stays visible: the install dialog names all of them, and an
            // approval whose install configs were filtered out of the per-tool view still endorses.
            endorsements: approvals.map(approval => this.toEndorsement(approval)),
            containedSkills: raw.containedSkills ?? [],
            containedMcpServers: raw.containedMcpServers ?? []
        };
    }

    /**
     * Unusable identifiers are dropped from the feed rather than half-supported: the alternatives are
     * two plugins silently sharing one directory, or a skill whose `/`-command cannot be typed. The
     * length cap matters because the encoding truncates, so two identifiers differing only past the
     * cap would encode to the same directory name.
     */
    protected isUsablePluginId(pluginId: string): boolean {
        return typeof pluginId === 'string' && pluginId.length > 0 && pluginId.length <= 100 && PLUGIN_ID_PATTERN.test(pluginId);
    }

    /**
     * Most recent first, `organizationId` ascending on ties. The specification prescribes a *total*
     * order: two clients given the same feed must pick the same approval, which a date-only sort
     * does not guarantee.
     */
    protected sortApprovals(approvals: RegistryPluginApproval[]): RegistryPluginApproval[] {
        return [...approvals].sort((a, b) => b.date.localeCompare(a.date) || a.organizationId.localeCompare(b.organizationId));
    }

    protected toEndorsement(approval: RegistryPluginApproval): PluginEndorsement {
        return {
            organizationId: approval.organizationId,
            date: approval.date,
            ...(approval.viaTrust !== undefined && { viaTrust: approval.viaTrust })
        };
    }
}
