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
import { GenericCapabilitySelections } from '@theia/ai-core';
import { AvailableGenericCapabilities } from './generic-capabilities-service';
import { GenericCapabilitiesTree } from './generic-capabilities-tree';

export interface GenericCapabilitiesSectionProps {
    /** Current generic capability selections */
    genericCapabilities: GenericCapabilitySelections;
    /** Called when a capability type's selection changes */
    onGenericCapabilityChange: (type: keyof GenericCapabilitySelections, ids: string[]) => void;
    /** Available capabilities to select from */
    availableCapabilities: AvailableGenericCapabilities;
    /** Items already in the agent prompt that should be disabled/greyed */
    disabledCapabilities: GenericCapabilitySelections;
    /** Whether the section is disabled */
    disabled?: boolean;
    /** Hover service for tooltips */
    hoverService: HoverService;
}

/**
 * Section component displaying generic capabilities in a tree layout.
 * Shows a unified multi-level tree with all capability types as roots,
 * groups as intermediate nodes, and items as leaves.
 * Includes a search bar for filtering capabilities.
 */
export const GenericCapabilitiesSection: React.FunctionComponent<GenericCapabilitiesSectionProps> = ({
    genericCapabilities,
    onGenericCapabilityChange,
    availableCapabilities,
    disabledCapabilities,
    disabled,
    hoverService
}) => {
    // Check if we have any available capabilities to show
    const hasAvailableCapabilities =
        availableCapabilities.skills.length > 0 ||
        availableCapabilities.mcpFunctions.length > 0 ||
        availableCapabilities.functions.length > 0 ||
        availableCapabilities.promptFragments.length > 0 ||
        availableCapabilities.agentDelegation.length > 0 ||
        availableCapabilities.variables.length > 0;

    if (!hasAvailableCapabilities) {
        return undefined;
    }

    return (
        <div className="theia-ChatInput-GenericCapabilitiesSection">
            <div className="theia-ChatInput-GenericCapabilitiesSection-heading">
                {nls.localize('theia/ai/chat-ui/genericCapabilities', 'Generic Capabilities')}
            </div>
            <GenericCapabilitiesTree
                genericCapabilities={genericCapabilities}
                onGenericCapabilityChange={onGenericCapabilityChange}
                availableCapabilities={availableCapabilities}
                disabledCapabilities={disabledCapabilities}
                disabled={disabled}
                hoverService={hoverService}
            />
        </div>
    );
};
