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

export interface ChatCapabilitiesPanelProps {
    capabilities: ParsedCapability[];
    overrides: Map<string, boolean>;
    onCapabilityChange: (fragmentId: string, enabled: boolean) => void;
    isOpen: boolean;
    disabled?: boolean;
}

/**
 * A collapsible panel that displays checkboxes for each capability variable
 * found in the current agent's prompt.
 */
export const ChatCapabilitiesPanel: React.FunctionComponent<ChatCapabilitiesPanelProps> = ({
    capabilities,
    overrides,
    onCapabilityChange,
    isOpen,
    disabled
}) => {
    if (capabilities.length === 0) {
        return undefined;
    }

    return (
        <div className={`theia-ChatInput-Capabilities-Panel ${isOpen ? 'expanded' : 'collapsed'}`}>
            <div className="theia-ChatInput-Capabilities-Content">
                {capabilities.map(capability => {
                    // Overrides should always have the value (initialized with defaults)
                    // Fall back to defaultEnabled only if somehow missing
                    const isChecked = overrides.get(capability.fragmentId) ?? capability.defaultEnabled;
                    const id = `capability-${capability.fragmentId}`;

                    return (
                        <label
                            key={capability.fragmentId}
                            className="theia-ChatInput-Capabilities-Item"
                            htmlFor={id}
                        >
                            <input
                                type="checkbox"
                                id={id}
                                checked={isChecked}
                                disabled={disabled}
                                onChange={e => onCapabilityChange(capability.fragmentId, e.target.checked)}
                            />
                            <span className="theia-ChatInput-Capabilities-Label">
                                {formatCapabilityLabel(capability.fragmentId)}
                            </span>
                        </label>
                    );
                })}
            </div>
        </div>
    );
};

ChatCapabilitiesPanel.displayName = 'ChatCapabilitiesPanel';

/**
 * Formats a capability fragment ID into a human-readable label.
 * Converts kebab-case to Title Case with spaces.
 */
function formatCapabilityLabel(fragmentId: string): string {
    // Convert kebab-case to words
    return fragmentId
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
}

export interface CapabilitiesButtonProps {
    hasCapabilities: boolean;
    isOpen: boolean;
    disabled?: boolean;
    onClick: () => void;
}

/**
 * Button component to toggle the capabilities panel visibility.
 * Styled to match the mode selector dropdown appearance.
 */
export const CapabilitiesButton = React.memo<CapabilitiesButtonProps>(function CapabilitiesButton({
    hasCapabilities,
    isOpen,
    disabled,
    onClick
}): React.JSX.Element | undefined {
    if (!hasCapabilities) {
        return undefined;
    }

    const handleKeyDown = (e: React.KeyboardEvent): void => {
        if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            onClick();
        }
    };

    return (
        <button
            type="button"
            className={`theia-ChatInput-Capabilities-Toggle${isOpen ? ' active' : ''}`}
            title={nls.localizeByDefault('Capabilities')}
            aria-label={nls.localizeByDefault('Capabilities')}
            aria-expanded={isOpen}
            disabled={disabled}
            onClick={onClick}
            onKeyDown={handleKeyDown}
        >
            <span className="theia-ChatInput-Capabilities-Toggle-Label">
                {nls.localizeByDefault('Capabilities')}
            </span>
            <span className={`codicon ${isOpen ? 'codicon-chevron-up' : 'codicon-chevron-down'}`} />
        </button>
    );
});
