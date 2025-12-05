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
 * Column definition for table configuration widgets.
 */
export interface TableColumn<T> {
    id: string;
    label: string;
    className?: string;
    renderCell: (item: T) => React.ReactNode;
}

/**
 * Base class for AI configuration widgets that display data in a table format.
 * This pattern is used by the token usage configuration widget.
 */
@injectable()
export abstract class AITableConfigurationWidget<T> extends AIConfigurationBaseWidget {
    protected items: T[] = [];

    /**
     * Get unique identifier for a row item.
     */
    protected abstract getItemId(item: T): string;

    /**
     * Define the columns for the table.
     */
    protected abstract getColumns(): TableColumn<T>[];

    /**
     * Load items to display in the table. Called during initialization.
     */
    protected abstract loadItems(): Promise<void>;

    /**
     * Optional: Render content before the table (e.g., header, filters, controls).
     */
    protected renderHeader(): React.ReactNode {
        return undefined;
    }

    /**
     * Optional: Render content after the table (e.g., summary, footer).
     */
    protected renderFooter(): React.ReactNode {
        return undefined;
    }

    /**
     * Optional: Additional CSS class for a specific row.
     */
    protected getRowClassName(item: T): string {
        return '';
    }

    protected renderContent(): React.ReactNode {
        const columns = this.getColumns();
        return (
            <div className="ai-table-configuration-main">
                {this.renderHeader()}
                <div className="ai-configuration-table-container">
                    <table className="ai-configuration-table">
                        <thead>
                            <tr>
                                {columns.map(column => (
                                    <th key={column.id} className={column.className}>
                                        {column.label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {this.items.map(item => (
                                <tr key={this.getItemId(item)} className={this.getRowClassName(item)}>
                                    {columns.map(column => (
                                        <td key={column.id} className={column.className}>
                                            {column.renderCell(item)}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {this.renderFooter()}
            </div>
        );
    }
}
