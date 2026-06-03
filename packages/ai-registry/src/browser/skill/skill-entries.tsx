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

import * as React from '@theia/core/shared/react';
import { nls } from '@theia/core';
import { HoverService } from '@theia/core/lib/browser';
import { MarkdownStringImpl } from '@theia/core/lib/common/markdown-rendering';
import { TreeElement } from '@theia/core/lib/browser/source-tree';
import { TypeBadge } from '@theia/vsx-registry/lib/browser/type-badge';
import { ExtensionCard } from '@theia/vsx-registry/lib/browser/extension-card';
import { InstalledSkillInfo, ResolvedSkillEntry, SkillClassificationResult } from '../../common/skill/skill-registry-types';

/**
 * Per-entry action callbacks provided by the contribution. Entries close over these so
 * their card render functions can dispatch user actions without pulling the install
 * service through dependency injection at the React level.
 */
export interface SkillEntryHandlers {
    install(entry: ResolvedSkillEntry): Promise<void>;
    uninstall(name: string): Promise<void>;
    unlink(name: string): Promise<void>;
    update(entry: ResolvedSkillEntry): Promise<void>;
    link(entry: ResolvedSkillEntry): Promise<void>;
    fixSkill(entry: ResolvedSkillEntry): Promise<void>;
}

/** An entry surfacing a locally installed skill in the Installed section. */
export class SkillInstalledEntry implements TreeElement {

    readonly id: string;

    constructor(
        readonly local: InstalledSkillInfo,
        readonly matchedEntry: ResolvedSkillEntry | undefined,
        readonly state: SkillClassificationResult,
        readonly handlers: SkillEntryHandlers,
        readonly hoverService: HoverService
    ) {
        this.id = `skill-installed-${local.name}`;
    }

    render(): React.ReactNode {
        return (
            <SkillCard
                title={this.matchedEntry?.name ?? this.local.name}
                description={this.matchedEntry?.description}
                identifier={this.matchedEntry?.skillId ?? this.local.skillId}
                hoverService={this.hoverService}
                actions={renderActions(this.state, this.matchedEntry, this.local.name, this.handlers)}
            />
        );
    }
}

/** An entry surfacing a registry-resolved skill in the Search Results section. */
export class SkillSearchResultEntry implements TreeElement {

    readonly id: string;

    constructor(
        readonly entry: ResolvedSkillEntry,
        readonly state: SkillClassificationResult,
        readonly handlers: SkillEntryHandlers,
        readonly hoverService: HoverService
    ) {
        this.id = `skill-search-${entry.skillId}`;
    }

    render(): React.ReactNode {
        return (
            <SkillCard
                title={this.entry.name}
                description={this.entry.description}
                identifier={this.entry.skillId}
                hoverService={this.hoverService}
                actions={renderActions(this.state, this.entry, this.entry.name, this.handlers)}
            />
        );
    }
}

interface SkillCardProps {
    title: string;
    description?: string;
    /** Stable identifier shown in the publisher-row slot - the registry skillId. */
    identifier?: string;
    hoverService: HoverService;
    actions?: React.ReactNode;
}

/** Build the markdown tooltip shown on hover, mirroring the depth of the VSX card's tooltip. */
function buildHoverContent(props: SkillCardProps): MarkdownStringImpl {
    const lines = [`**${props.title}**`];
    if (props.description) {
        lines.push('', props.description);
    }
    if (props.identifier) {
        lines.push('', `_${props.identifier}_`);
    }
    return new MarkdownStringImpl(lines.join('\n'));
}

/**
 * Skill entry card. Renders against the shared {@link ExtensionCard} shell so skill
 * entries sit visually alongside extensions and MCP servers in the unified Extensions
 * view, sharing the layout and hover tooltip.
 */
const SkillCard: React.FC<SkillCardProps> = props => (
    <ExtensionCard
        title={props.title}
        description={props.description}
        icon={<i className="codicon codicon-mortar-board" />}
        iconClassName="theia-skill-extension-icon"
        typeBadge={
            <TypeBadge
                icon={<i className="codicon codicon-mortar-board" />}
                label={nls.localizeByDefault('Skills')}
                variant="skill"
            />
        }
        publisher={props.identifier}
        publisherTitle={props.identifier}
        trust="verified"
        hover={{ content: buildHoverContent(props), hoverService: props.hoverService }}
        actions={
            <div className="theia-skill-extension-actions">
                {props.actions}
                <div
                    className="codicon codicon-settings-gear action theia-skill-extension-gear-placeholder"
                    aria-hidden="true"
                />
            </div>
        }
    />
);

/**
 * Buttons are state-driven and identical in the Installed and Search sections:
 *
 * - `not-installed`           -> [Install]
 * - `installed-from-registry` -> [Update?] [Uninstall]   (Update only when the registry content hash differs)
 * - `installed-manually`      -> [Link to registry]       (no Uninstall - adopt the local folder first)
 * - `fix-skill`               -> warning [Fix Skill] [Uninstall]
 * - `installed-link-stale`    -> warning "Not in registry" [Unlink] [Uninstall]
 * - `installed-user-added`    -> filtered out before reaching this view
 */
function renderActions(
    state: SkillClassificationResult,
    registryEntry: ResolvedSkillEntry | undefined,
    name: string,
    handlers: SkillEntryHandlers
): React.ReactNode {
    switch (state.kind) {
        case 'not-installed':
            return registryEntry && (
                <button className="theia-button prominent action" onClick={() => handlers.install(registryEntry)}>
                    {nls.localizeByDefault('Install')}
                </button>
            );
        case 'installed-from-registry':
            return (
                <>
                    {state.updateAvailable && registryEntry && (
                        <button className="theia-button prominent action" onClick={() => handlers.update(registryEntry)}>
                            {nls.localizeByDefault('Update')}
                        </button>
                    )}
                    <button className="theia-button action" onClick={() => handlers.uninstall(name)}>
                        {nls.localizeByDefault('Uninstall')}
                    </button>
                </>
            );
        case 'installed-manually':
            return registryEntry && (
                <button className="theia-button action" onClick={() => handlers.link(registryEntry)}>
                    {nls.localize('theia/ai-registry/skill/action/link', 'Link to registry')}
                </button>
            );
        case 'fix-skill':
            return (
                <>
                    <i
                        className="codicon codicon-warning theia-skill-extension-warning"
                        title={nls.localize(
                            'theia/ai-registry/skill/warning/fix',
                            "This skill's files differ from the registry. Click 'Fix Skill' to restore them."
                        )}
                    />
                    {registryEntry && (
                        <button className="theia-button prominent action" onClick={() => handlers.fixSkill(registryEntry)}>
                            {nls.localize('theia/ai-registry/skill/action/fix', 'Fix Skill')}
                        </button>
                    )}
                    <button className="theia-button action" onClick={() => handlers.uninstall(name)}>
                        {nls.localizeByDefault('Uninstall')}
                    </button>
                </>
            );
        case 'installed-link-stale': {
            const tooltip = nls.localize(
                'theia/ai-registry/skill/warning/linkStale',
                'This skill was installed from the registry, but the registry no longer lists it. '
                + 'Click Unlink to drop the registry link and keep the files, or Uninstall to remove the skill.'
            );
            return (
                <>
                    <span className="theia-skill-extension-link-stale-message" title={tooltip}>
                        <i className="codicon codicon-warning theia-skill-extension-warning" />
                        {nls.localize('theia/ai-registry/skill/warning/notInRegistry', 'Not in registry')}
                    </span>
                    <button className="theia-button action" title={tooltip} onClick={() => handlers.unlink(name)}>
                        {nls.localize('theia/ai-registry/skill/action/unlink', 'Unlink')}
                    </button>
                    <button className="theia-button action" onClick={() => handlers.uninstall(name)}>
                        {nls.localizeByDefault('Uninstall')}
                    </button>
                </>
            );
        }
        case 'installed-user-added':
            return undefined;
    }
}
