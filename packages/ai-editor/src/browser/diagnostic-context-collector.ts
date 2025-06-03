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

import { injectable } from '@theia/core/shared/inversify';
import * as monaco from '@theia/monaco-editor-core';
import { MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor';
import { EditorContextCollectorContribution, EditorContextData } from './editor-context-collector';

/**
 * Collector that provides diagnostic information (errors, warnings, etc.) from the editor.
 */
@injectable()
export class DiagnosticContextCollector implements EditorContextCollectorContribution {

    readonly id = 'diagnostics';
    readonly priority = 5;

    async collectContext(editor: MonacoEditor): Promise<EditorContextData | undefined> {
        const model = editor.getControl().getModel();
        if (!model) {
            return undefined;
        }

        const markers = monaco.editor.getModelMarkers({ resource: model.uri });

        if (markers.length === 0) {
            return {
                errorCount: 0,
                warningCount: 0,
                infoCount: 0,
                hintCount: 0,
                totalIssues: 0
            };
        }

        const issues: Array<{
            line: number;
            column: number;
            severity: string;
            message: string;
            source?: string;
        }> = [];

        const markerCounter = {
            [monaco.MarkerSeverity.Error]: 0,
            [monaco.MarkerSeverity.Warning]: 0,
            [monaco.MarkerSeverity.Info]: 0,
            [monaco.MarkerSeverity.Hint]: 0
        };

        markers.forEach(marker => {
            markerCounter[marker.severity]++;

            issues.push({
                line: marker.startLineNumber,
                column: marker.startColumn,
                severity: this.severityToString(marker.severity),
                message: marker.message,
                source: marker.source
            });
        });

        return {
            diagnosticCounts: {
                errorCount: markerCounter[monaco.MarkerSeverity.Error],
                warningCount: markerCounter[monaco.MarkerSeverity.Warning],
                infoCount: markerCounter[monaco.MarkerSeverity.Info],
                hintCount: markerCounter[monaco.MarkerSeverity.Hint]
            },
            totalIssues: markers.length,
            issues: issues.slice(0, 20) // Limit to first 20 issues to avoid overwhelming context
        };
    }

    private severityToString(severity: monaco.MarkerSeverity): string {
        switch (severity) {
            case monaco.MarkerSeverity.Error:
                return 'error';
            case monaco.MarkerSeverity.Warning:
                return 'warning';
            case monaco.MarkerSeverity.Info:
                return 'info';
            case monaco.MarkerSeverity.Hint:
                return 'hint';
            default:
                return 'unknown';
        }
    }
}
