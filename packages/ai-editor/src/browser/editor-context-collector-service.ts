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

import { injectable, inject, named } from '@theia/core/shared/inversify';
import { ContributionProvider } from '@theia/core';
import { MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor';
import { EditorContextCollectorContribution, EditorContextData } from './editor-context-collector';

/**
 * Service that manages all registered editor context collectors and aggregates their data.
 */
@injectable()
export class EditorContextCollectorService {
    @inject(ContributionProvider) @named(EditorContextCollectorContribution)
    protected readonly collectorProvider!: ContributionProvider<EditorContextCollectorContribution>;

    /**
     * Collect context data from all registered collectors for the given editor.
     * Collectors are executed in priority order (highest first).
     * Errors from individual collectors are caught and logged to prevent disruption.
     *
     * @param editor The Monaco editor instance to collect context from
     * @returns Promise resolving to a map of collector ID to context data
     */
    async collectEditorContext(editor: MonacoEditor): Promise<Record<string, EditorContextData>> {
        const result: Record<string, EditorContextData> = {};

        const collectors = this.collectorProvider.getContributions();
        const sortedCollectors = [...collectors].sort((a, b) => b.priority - a.priority);

        await Promise.allSettled(
            sortedCollectors.map(async collector => {
                try {
                    const contextData = await collector.collectContext(editor);
                    if (contextData) {
                        result[collector.id] = contextData;
                    }
                } catch (error) {
                    console.warn(`Error collecting context from collector '${collector.id}':`, error);
                }
            })
        );

        return result;
    }
}
