// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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

export interface PromptVariantBadgeProps {
    variantId: string;
    isEdited: boolean;
    hoverService: HoverService;
}

export const PromptVariantBadge: React.FC<PromptVariantBadgeProps> = ({ variantId, isEdited, hoverService }) => {
    // eslint-disable-next-line no-null/no-null
    const badgeRef = React.useRef<HTMLSpanElement>(null);
    const displayText = isEdited
        ? `[${nls.localize('theia/ai/chat-ui/edited', 'edited')}] ${variantId}`
        : variantId;
    const baseTooltip = nls.localize('theia/ai/chat-ui/variantTooltip', 'Prompt variant: {0}', variantId);
    const tooltip = isEdited
        ? baseTooltip + '. ' + nls.localize('theia/ai/chat-ui/editedTooltipHint', 'This prompt variant has been edited. You can reset it in the AI Configuration view.')
        : baseTooltip;

    return (
        <span
            ref={badgeRef}
            className={`theia-PromptVariantBadge ${isEdited ? 'edited' : ''}`}
            onMouseEnter={() => {
                if (badgeRef.current) {
                    hoverService.requestHover({
                        content: tooltip,
                        target: badgeRef.current,
                        position: 'right'
                    });
                };
            }}
        >
            {displayText}
        </span>
    );
};
