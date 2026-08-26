// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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

import { nls } from '@theia/core';
import { codicon } from '@theia/core/lib/browser';
import { InstalledAgentPluginInfo } from '@theia/ai-core/lib/browser/agent-plugin-ui-bridge';
import * as React from '@theia/core/shared/react';

/**
 * Where a configuration entry came from, when that is not the user: an AI registry entry, or an Agent
 * Plugin that contributed it. Built through {@link AiConfigurationOrigin.registry} or
 * {@link AiConfigurationOrigin.agentPlugin} rather than by hand, so that the same origin reads the same
 * on every page - an entry's provenance is surfaced in an overview list, on a detail header and in a
 * collapsible row, and those diverged while each page phrased it for itself.
 */
export interface AiConfigurationOrigin {
    /** Short, on one line next to the entry's name; the {@link tooltip} carries the detail. */
    readonly label: string;
    /** `codicon(...)` class shown before the label. */
    readonly iconClass: string;
    readonly tooltip: string;
    /** Opens or reveals the origin. Omit for an origin with nothing to navigate to; the badge is then static. */
    readonly activate?: () => void;
}

export namespace AiConfigurationOrigin {

    /**
     * An entry installed from, or linked to, an AI registry approval.
     *
     * @param open reveals the entry in the registry UI. Omit it where no registry UI is bound: the entry
     * still came from the registry, which is worth stating, so the badge is shown - just not as a link.
     */
    export function registry(entryId: string, open?: () => void): AiConfigurationOrigin {
        return {
            label: nls.localize('theia/ai/core/aiConfiguration/origin/fromRegistry', 'From registry'),
            iconClass: codicon('link-external'),
            tooltip: open
                ? nls.localize('theia/ai/core/aiConfiguration/origin/openInRegistry', 'Open in AI registry: {0}', entryId)
                : nls.localize('theia/ai/core/aiConfiguration/origin/registryEntry', 'AI registry entry: {0}', entryId),
            activate: open
        };
    }

    /**
     * An entry contributed by an installed Agent Plugin. Takes the resolved plugin rather than its
     * identifier: a bare identifier is not worth showing, so a caller that cannot resolve one renders no
     * badge at all.
     */
    export function agentPlugin(plugin: InstalledAgentPluginInfo, reveal: () => void): AiConfigurationOrigin {
        return {
            label: nls.localize('theia/ai/core/aiConfiguration/origin/viaAgentPlugin', 'via {0}', plugin.name),
            // `package`, matching the Agent Plugin cards in the Extensions view; `extensions` is the icon
            // that view's VS Code extension section owns.
            iconClass: codicon('package'),
            tooltip: nls.localize('theia/ai/core/aiConfiguration/origin/openAgentPlugin', 'Open the Agent Plugin that provides this: {0}', plugin.name),
            activate: reveal
        };
    }
}

export interface AiConfigurationOriginBadgeProps {
    readonly origin: AiConfigurationOrigin;
}

/**
 * One {@link AiConfigurationOrigin} as a pill next to an entry's name: a `<button>` when the origin can
 * be opened, a plain `<span>` when it cannot, so that only what is actually navigable is focusable.
 * The click never bubbles - these sit inside rows and headers that are themselves clickable, and
 * following the badge must not also open the row.
 */
export const AiConfigurationOriginBadge: React.FC<AiConfigurationOriginBadgeProps> = ({ origin }) => {
    const content = <>
        <span aria-hidden='true' className={`ai-configuration-origin-badge-icon ${origin.iconClass}`}></span>
        <span className='ai-configuration-origin-badge-label'>{origin.label}</span>
    </>;
    return origin.activate
        ? <button
            type='button'
            className='ai-configuration-origin-badge activatable'
            title={origin.tooltip}
            aria-label={origin.tooltip}
            onClick={event => {
                event.stopPropagation();
                origin.activate!();
            }}
        >{content}</button>
        : <span className='ai-configuration-origin-badge' title={origin.tooltip}>{content}</span>;
};

export interface AiConfigurationOriginBadgesProps {
    readonly origins?: AiConfigurationOrigin[];
}

/** The origins of one entry, in the order given; nothing at all when it has none, which is the common case. */
export const AiConfigurationOriginBadges: React.FC<AiConfigurationOriginBadgesProps> = ({ origins }) =>
    origins && origins.length > 0
        ? <span className='ai-configuration-origin-badges'>
            {origins.map(origin => <AiConfigurationOriginBadge key={origin.label} origin={origin} />)}
        </span>
        : undefined;
