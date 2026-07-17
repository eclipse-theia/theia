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
import * as React from '@theia/core/shared/react';
import { nls } from '@theia/core';
import { HoverService } from '@theia/core/lib/browser';

export interface ModelBadgeProps {
    /** Identifier of the language model that produced the response. */
    modelId: string;
    hoverService: HoverService;
}

/**
 * Badge shown next to a chat response indicating which language model produced it. Mirrors the
 * model badge shown in the AI History view.
 */
export const ModelBadge: React.FC<ModelBadgeProps> = ({ modelId, hoverService }) => {
    // eslint-disable-next-line no-null/no-null
    const badgeRef = React.useRef<HTMLSpanElement>(null);
    const tooltip = nls.localize('theia/ai/chat-ui/modelBadgeTooltip', 'Language model used for this response: {0}', modelId);

    return (
        <span
            ref={badgeRef}
            className='theia-ModelBadge'
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
            {modelId}
        </span>
    );
};
