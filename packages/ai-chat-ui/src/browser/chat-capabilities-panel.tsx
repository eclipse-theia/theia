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
import { ParsedCapability } from '@theia/ai-core';
import { nls } from '@theia/core';
import { HoverService } from '@theia/core/lib/browser';

export interface CapabilityChipsRowProps {
    capabilities: ParsedCapability[];
    overrides: Map<string, boolean>;
    onCapabilityChange: (fragmentId: string, enabled: boolean) => void;
    disabled?: boolean;
    hoverService: HoverService;
}

/**
 * A row of toggle chips rendered inline inside the editor box,
 * wrapped in a collapsible "Capabilities" section.
 *
 * Keyboard navigation: roving tabindex — Tab enters the group on the
 * currently focused chip, Arrow Left/Right moves between chips,
 * Space/Enter toggles, Tab leaves the group.
 *
 * Accessibility: container has role="group" with aria-label,
 * each chip uses role="switch" with aria-checked and a descriptive
 * title tooltip.
 */
export const CapabilityChipsRow: React.FunctionComponent<CapabilityChipsRowProps> = ({
    capabilities,
    overrides,
    onCapabilityChange,
    disabled,
    hoverService
}) => {
    const [focusIndex, setFocusIndex] = React.useState(0);
    // eslint-disable-next-line no-null/no-null
    const containerRef = React.useRef<HTMLDivElement>(null);

    if (capabilities.length === 0) {
        return undefined;
    }

    const handleKeyDown = (e: React.KeyboardEvent): void => {
        if (disabled) {
            return;
        }
        let newIndex = focusIndex;
        if (e.key === 'ArrowRight' || (e.key === 'Tab' && !e.shiftKey)) {
            if (focusIndex < capabilities.length - 1) {
                e.preventDefault();
                newIndex = focusIndex + 1;
            }
        } else if (e.key === 'ArrowLeft' || (e.key === 'Tab' && e.shiftKey)) {
            if (focusIndex > 0) {
                e.preventDefault();
                newIndex = focusIndex - 1;
            }
        }
        if (newIndex !== focusIndex) {
            setFocusIndex(newIndex);
            const chips = containerRef.current?.querySelectorAll<HTMLElement>('[role="switch"]');
            chips?.[newIndex]?.focus();
        }
    };

    return (
        <div className="theia-ChatInput-CapabilitiesSection">
            <div className="theia-ChatInput-CapabilitiesSection-heading">
                {nls.localizeByDefault('Capabilities')}
            </div>
            <div
                ref={containerRef}
                className="theia-ChatInput-CapabilityChips"
                role="group"
                aria-label={nls.localizeByDefault('Capabilities')}
                onKeyDown={handleKeyDown}
            >
                {capabilities.map((capability, index) => {
                    const isChecked = overrides.get(capability.fragmentId) ?? capability.defaultEnabled;
                    return (
                        <CapabilityChip
                            key={capability.fragmentId}
                            fragmentId={capability.fragmentId}
                            name={capability.name}
                            description={capability.description}
                            checked={isChecked}
                            disabled={disabled}
                            tabIndex={index === focusIndex ? 0 : -1}
                            onToggle={onCapabilityChange}
                            onFocus={() => setFocusIndex(index)}
                            hoverService={hoverService}
                        />
                    );
                })}
            </div>
        </div>
    );
};

interface CapabilityChipProps {
    fragmentId: string;
    name?: string;
    description?: string;
    checked: boolean;
    disabled?: boolean;
    tabIndex: number;
    onToggle: (fragmentId: string, enabled: boolean) => void;
    onFocus: () => void;
    hoverService: HoverService;
}

/**
 * Individual capability toggle chip, styled like the search widget
 * option buttons (match case, regex). Uses inputOption theme colors
 * when enabled, transparent when disabled.
 */
const CapabilityChip = React.memo<CapabilityChipProps>(function CapabilityChip({
    fragmentId,
    name,
    description,
    checked,
    disabled,
    tabIndex,
    onToggle,
    onFocus,
    hoverService
}: CapabilityChipProps): React.JSX.Element {
    // eslint-disable-next-line no-null/no-null
    const chipRef = React.useRef<HTMLSpanElement>(null);

    const handleClick = (): void => {
        if (!disabled) {
            onToggle(fragmentId, !checked);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent): void => {
        if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            onToggle(fragmentId, !checked);
        }
    };

    const label = name ?? fragmentId;

    const handleMouseEnter = (): void => {
        if (chipRef.current) {
            const content = description ? `${label}: ${description}` : label;
            hoverService.requestHover({
                content,
                target: chipRef.current,
                position: 'top'
            });
        }
    };

    return (
        <span
            ref={chipRef}
            className={`theia-ChatInput-CapabilityChip${checked ? ' checked' : ''}${disabled ? ' chip-disabled' : ''}`}
            role="switch"
            aria-checked={checked}
            aria-label={label}
            tabIndex={tabIndex}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            onFocus={onFocus}
            onMouseEnter={handleMouseEnter}
        >
            {checked && <span className="codicon codicon-check theia-ChatInput-CapabilityChip-icon" />}
            {label}
        </span>
    );
});
