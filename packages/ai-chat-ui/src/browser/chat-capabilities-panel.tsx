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

export interface CollapsibleSectionProps {
    label: string;
    tooltip?: string;
    defaultExpanded?: boolean;
    hoverService: HoverService;
    children: React.ReactNode;
}

/**
 * A subtle collapsible section for use inside the chat input
 * configuration area. Renders a muted label with a separator line
 * that toggles the content below.
 *
 * Accessibility: uses a native `<button>` with `aria-expanded`.
 */
export const CollapsibleSection: React.FunctionComponent<CollapsibleSectionProps> = ({
    label,
    tooltip,
    defaultExpanded = true,
    hoverService,
    children
}) => {
    const [expanded, setExpanded] = React.useState(defaultExpanded);

    const toggle = React.useCallback(() => {
        setExpanded(prev => !prev);
    }, []);

    const handleMouseEnter = React.useCallback((e: React.MouseEvent) => {
        hoverService.requestHover({
            content: tooltip ?? label,
            target: e.currentTarget as HTMLElement,
            position: 'top'
        });
    }, [hoverService, tooltip, label]);

    return (
        <div className="theia-ChatInput-CollapsibleSection">
            <button
                className={`theia-ChatInput-CollapsibleSection-header${expanded ? '' : ' collapsed'}`}
                type="button"
                aria-expanded={expanded}
                onClick={toggle}
            >
                <span className={`codicon codicon-chevron-${expanded ? 'down' : 'right'} theia-ChatInput-CollapsibleSection-chevron`} />
                <span
                    className="theia-ChatInput-CollapsibleSection-label"
                    onMouseEnter={handleMouseEnter}
                >
                    {label}
                </span>
            </button>
            {expanded && children}
        </div>
    );
};

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
        <CollapsibleSection
            label={nls.localizeByDefault('Capabilities')}
            tooltip={nls.localize('theia/ai/chat-ui/toggleCapabilities', 'Toggle Capabilities')}
            hoverService={hoverService}
        >
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
        </CollapsibleSection>
    );
};

interface CapabilityChipProps {
    fragmentId: string;
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

    const label = fragmentId; // TODO: should be a dedicated display label of the prompt fragment

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
