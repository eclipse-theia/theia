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
import { injectable } from '@theia/core/shared/inversify';
import { AIConfigurationBaseWidget } from './ai-configuration-base-widget';

/**
 * Base class for AI configuration widgets that display items in a responsive card grid.
 * This pattern is used by the MCP configuration widget.
 */
@injectable()
export abstract class AICardGridConfigurationWidget<T> extends AIConfigurationBaseWidget {
    protected items: T[] = [];

    /**
     * Get unique identifier for an item.
     */
    protected abstract getItemId(item: T): string;

    /**
     * Render a single card for an item.
     */
    protected abstract renderCard(item: T): React.ReactNode;

    /**
     * Load items to display in the grid. Called during initialization.
     */
    protected abstract loadItems(): Promise<void>;

    /**
     * Optional: Render content before the card grid (e.g., header, controls).
     */
    protected renderHeader(): React.ReactNode {
        return undefined;
    }

    /**
     * Optional: Render content after the card grid.
     */
    protected renderFooter(): React.ReactNode {
        return undefined;
    }

    protected renderContent(): React.ReactNode {
        return (
            <div className="ai-card-grid-configuration-main">
                {this.renderHeader()}
                <div className="ai-configuration-card-grid">
                    {this.items.map(item => (
                        <div key={this.getItemId(item)} className="ai-configuration-card">
                            {this.renderCard(item)}
                        </div>
                    ))}
                </div>
                {this.renderFooter()}
            </div>
        );
    }
}
