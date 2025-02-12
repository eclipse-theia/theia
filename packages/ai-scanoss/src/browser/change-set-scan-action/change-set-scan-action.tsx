// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH and others.
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

import { ChangeSet, ChangeSetElement } from '@theia/ai-chat';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { ChangeSetActionRenderer } from '@theia/ai-chat-ui/lib/browser/change-set-actions/change-set-action-service';
import { PreferenceService } from '@theia/core/lib/browser/preferences';
import { ScanOSSService, ScanOSSResult, ScanOSSResultMatch } from '@theia/scanoss';
import * as React from '@theia/core/shared/react';
import { SCANOSS_MODE_PREF } from '../ai-scanoss-preferences';
import { SCAN_OSS_API_KEY_PREF } from '@theia/scanoss/lib/browser/scanoss-preferences';
import { ChangeSetFileElement } from '@theia/ai-chat/lib/browser/change-set-file-element';
import { ScanOSSDialog } from '../ai-scanoss-code-scan-action';
import { StandaloneServices } from '@theia/monaco-editor-core/esm/vs/editor/standalone/browser/standaloneServices';
import { IDiffProviderFactoryService } from '@theia/monaco-editor-core/esm/vs/editor/browser/widget/diffEditor/diffProviderFactoryService';
import { IDocumentDiffProvider } from '@theia/monaco-editor-core/esm/vs/editor/common/diff/documentDiffProvider';
import { MonacoTextModelService } from '@theia/monaco/lib/browser/monaco-text-model-service';
import { CancellationToken, Emitter } from '@theia/core';

type ScanOSSState = 'pending' | 'clean' | 'match' | 'error' | 'none';
type ScanOSSResultOptions = 'pending' | ScanOSSResult[] | undefined;

@injectable()
export class ChangeSetScanActionRenderer implements ChangeSetActionRenderer {
    readonly id = 'change-set-scanoss';
    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange = this.onDidChangeEmitter.event;

    @inject(ScanOSSService)
    protected readonly scanService: ScanOSSService;

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    @inject(MonacoTextModelService)
    protected readonly textModelService: MonacoTextModelService;

    protected differ: IDocumentDiffProvider;

    @postConstruct()
    init(): void {
        this.differ = StandaloneServices.get(IDiffProviderFactoryService).createDiffProvider({ diffAlgorithm: 'advanced' });
        this._scan = this.runScan.bind(this);
        this.preferenceService.onPreferenceChanged(e => e.affects(SCANOSS_MODE_PREF) && this.onDidChangeEmitter.fire());
    }

    canRender(changeSet: ChangeSet): boolean {
        const preference = this.preferenceService.get(SCANOSS_MODE_PREF, 'off');
        return preference !== 'off' && changeSet.getElements().some(candidate => candidate instanceof ChangeSetFileElement);
    }

    render(changeSet: ChangeSet): React.ReactNode {
        return (
            <ChangeSetScanOSSIntegration
                changeSetElements={changeSet.getElements()}
                scanOssMode={this.preferenceService.get(SCANOSS_MODE_PREF, 'off')}
                scanChangeSet={this._scan}
            />
        );
    }

    protected _scan: (changeSetElements: ChangeSetElement[]) => Promise<ScanOSSResult[]>;

    protected async runScan(changeSetElements: ChangeSetElement[]): Promise<ScanOSSResult[]> {
        const apiKey = this.preferenceService.get(SCAN_OSS_API_KEY_PREF, undefined);
        const fileResults = await Promise.all(
            changeSetElements.filter((candidate): candidate is ChangeSetFileElement => candidate instanceof ChangeSetFileElement).map(async fileChange => {
                if (fileChange.targetState.trim().length === 0) {
                    return { type: 'clean' } satisfies ScanOSSResult;
                }

                if (fileChange.replacements) {
                    return this.scanService.scanContent(fileChange.replacements.map(({ newContent }) => newContent).join('\n\n'), apiKey);
                }

                const textModels = await Promise.all([
                    this.textModelService.createModelReference(fileChange.uri),
                    this.textModelService.createModelReference(fileChange.changedUri)
                ]);

                const [original, changed] = textModels;
                const diff = await this.differ.computeDiff(
                    original.object.textEditorModel,
                    changed.object.textEditorModel,
                    { maxComputationTimeMs: 5000, computeMoves: false, ignoreTrimWhitespace: true },
                    CancellationToken.None
                );

                if (diff.identical) { return { type: 'clean' } satisfies ScanOSSResult; }

                const insertions = diff.changes.filter(candidate => !candidate.modified.isEmpty);

                if (insertions.length === 0) { return { type: 'clean' } satisfies ScanOSSResult; }

                const changedLinesInSuggestion = insertions.map(change => {
                    const range = change.modified.toInclusiveRange();
                    return range ? changed.object.textEditorModel.getValueInRange(range) : ''; // In practice, we've filtered out cases where the range would be null already.
                }).join('\n\n');

                textModels.forEach(ref => ref.dispose());

                return this.scanService.scanContent(changedLinesInSuggestion, apiKey);
            }));
        return fileResults;
    }
}

interface ChangeSetScanActionProps {
    changeSetElements: ChangeSetElement[];
    scanOssMode: string;
    scanChangeSet: (changeSet: ChangeSetElement[]) => Promise<ScanOSSResult[]>
}

const ChangeSetScanOSSIntegration = React.memo(({
    changeSetElements,
    scanOssMode,
    scanChangeSet
}: ChangeSetScanActionProps) => {
    const [scanOSSResult, setScanOSSResult] = React.useState<ScanOSSResult[] | 'pending' | undefined>(undefined);

    React.useEffect(() => {
        if (scanOSSResult === undefined) {
            if (scanOssMode === 'automatic' && scanOSSResult === undefined) {
                setScanOSSResult('pending');
                scanChangeSet(changeSetElements).then(result => setScanOSSResult(result));
            }
        }
    }, [scanOssMode, scanOSSResult]);

    const scanOSSClicked = React.useCallback(async () => {
        if (scanOSSResult === 'pending') {
            return;
        } else if (!scanOSSResult || scanOSSResult.some(candidate => candidate.type === 'error')) {
            setScanOSSResult('pending');
            scanChangeSet(changeSetElements).then(result => setScanOSSResult(result));
        } else {
            const matches = scanOSSResult.filter((candidate): candidate is ScanOSSResultMatch => candidate.type === 'match');
            if (matches.length === 0) { return; }
            const dialog = new ScanOSSDialog(matches);
            dialog.open();
        }
    }, [scanOSSResult]);

    const state = getResult(scanOSSResult);
    const content = getTitle(state);
    const title = `ScanOSS: ${content}`;

    if (state === 'clean') {
        return <div
            className={`theia-button button theia-changeSet-scanOss ${state}`}
            title={title}
        >
            <span className={`scanoss-logo show-check icon-container ${state}`} />
            {content}
            <span className="status-icon">
                <span className="codicon codicon-pass-filled" />
            </span>
        </div>;
    } else if (state === 'pending') {
        return <div
            className={`theia-button theia-changeSet-scanOss ${state}`}
            title={title}
        >
            <span className={`scanoss-logo show-check icon-container ${state}`} />
            {content}
            <i className="fa fa-spinner fa-spin"></i>
        </div>;
    } else {
        return <button
            className={`theia-button theia-changeSet-scanOss ${state}`}
            title={title}
            onClick={scanOSSClicked}
        >
            <span className={`scanoss-logo show-check icon-container ${state}`} />
            {content}
        </button>;
    }
});

function getResult(scanOSSResult: ScanOSSResultOptions): ScanOSSState {
    switch (true) {
        case scanOSSResult === undefined: return 'none';
        case scanOSSResult === 'pending': return 'pending';
        case (scanOSSResult as ScanOSSResult[]).some(candidate => candidate.type === 'error'): return 'error';
        case (scanOSSResult as ScanOSSResult[]).some(candidate => candidate.type === 'match'): return 'match';
        default: return 'clean';
    }
}

function getTitle(result: ScanOSSState): string {
    switch (result) {
        case 'none': return 'Scan';
        case 'pending': return 'Scanning...';
        case 'error': return 'Errored: Rerun';
        case 'match': return 'View Matches';
        case 'clean': return 'No Matches';
    }
}
