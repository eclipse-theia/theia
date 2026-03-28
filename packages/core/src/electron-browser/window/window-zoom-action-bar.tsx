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
import { createRoot } from 'react-dom/client';
import * as React from '../../../shared/react';
import { ACTION_ITEM, codicon, CommonCommands, KeybindingRegistry } from '../../browser';
import { Command, CommandRegistry, nls } from '../../common';
import { PREF_WINDOW_ZOOM_LEVEL, ZoomLevel } from '../../electron-common/electron-window-preferences';
import { ElectronCommands } from '../menu/electron-menu-contribution';

export interface WindowZoomActionBarProps {
    container: HTMLElement
    zoomLevel: number;
    commandRegistry: CommandRegistry;
    keybindingRegistry: KeybindingRegistry;
}

export class WindowZoomActionBar extends React.Component<WindowZoomActionBarProps> {

    protected getTitleWithKeybinding(command: Command): string {
        const bindings = this.props.keybindingRegistry.getKeybindingsForCommand(command.id);
        // Only consider the first active keybinding.
        if (bindings.length) {
            const binding = bindings.find(b => this.props.keybindingRegistry.isEnabledInScope(b, this.props.container));
            if (binding) {
                const accelerator = this.props.keybindingRegistry.acceleratorFor(binding, '+', true);
                return `${command.label} (${accelerator})`;
            }
        }
        return command.label!;
    }

    protected renderActionButton(command: Command, iconName?: string, commandArgs: unknown[] = []): React.ReactNode {
        return (
            <div
                className={`${ACTION_ITEM} window-zoom-button`}
                role='button'
                tabIndex={0}
                aria-label={command.label}
                title={this.getTitleWithKeybinding(command)}
                onClick={() => this.props.commandRegistry.executeCommand(command.id, ...commandArgs)}
                onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        this.props.commandRegistry.executeCommand(command.id, ...commandArgs);
                    }
                }}
            >
                {iconName ? <div className={codicon(iconName)}></div> : <div>{command.label}</div>}
            </div>
        );
    }

    protected renderZoomDisplay(): React.ReactNode {
        const percentage = Math.round(100 * Math.pow(ZoomLevel.ZOOM_BASE, this.props.zoomLevel));
        const zoomLevelText = nls.localizeByDefault('Zoom Level: {0} ({1}%)', this.props.zoomLevel.toString(), percentage.toString());
        return (
            <div
                className='window-zoom-display'
                role='status'
                aria-live='polite'
                aria-atomic='true'
                aria-label={zoomLevelText}
                title={zoomLevelText}
            >
                <div>{this.props.zoomLevel}</div>
            </div>
        );
    }

    override render(): React.ReactNode {
        return (
            <>
                {this.renderActionButton(ElectronCommands.ZOOM_OUT, 'remove')}
                {this.renderZoomDisplay()}
                {this.renderActionButton(ElectronCommands.ZOOM_IN, 'plus')}
                {this.renderActionButton(ElectronCommands.RESET_ZOOM)}
                {this.renderActionButton(CommonCommands.OPEN_PREFERENCES, 'settings-gear', [PREF_WINDOW_ZOOM_LEVEL])}
            </>
        );
    }
}

/**
 * Helper function to render the WindowZoomActionBar React component into a DOM container element.
 * This function can be called from a TypeScript file without JSX.
 */
export function renderWindowZoomActionBar(
    container: HTMLElement,
    zoomLevel: number,
    commandRegistry: CommandRegistry,
    keybindingRegistry: KeybindingRegistry,
): void {
    const root = createRoot(container);
    root.render(
        <WindowZoomActionBar
            container={container}
            zoomLevel={zoomLevel}
            commandRegistry={commandRegistry}
            keybindingRegistry={keybindingRegistry}
        />
    );
}
