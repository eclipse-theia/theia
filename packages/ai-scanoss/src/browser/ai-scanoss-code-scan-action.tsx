// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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
// ***
import { inject, injectable } from '@theia/core/shared/inversify';
import { CodeChatResponseContent } from '@theia/ai-chat';
import { CodePartRendererAction } from '@theia/ai-chat-ui/lib/browser/chat-response-renderer';
import {
    ScanOSSResult,
    ScanOSSResultMatch,
    ScanOSSService,
} from '@theia/scanoss';
import { Dialog, PreferenceService } from '@theia/core/lib/browser';
import { ReactNode } from '@theia/core/shared/react';
import { ResponseNode } from '@theia/ai-chat-ui/lib/browser/chat-tree-view';
import * as React from '@theia/core/shared/react';
import { ReactDialog } from '@theia/core/lib/browser/dialogs/react-dialog';
import { SCAN_OSS_API_KEY_PREF } from '@theia/scanoss/lib/browser/scanoss-preferences';
import { SCANOSS_MODE_PREF } from './ai-scanoss-preferences';

// cached map of scanOSS results.
// 'false' is stored when not automatic check is off and it was not (yet) requested deliberately.
type ScanOSSResults = Map<string, ScanOSSResult | false>;
interface HasScanOSSResults {
    scanOSSResults: ScanOSSResults;
    [key: string]: unknown;
}
function hasScanOSSResults(data: {
    [key: string]: unknown;
}): data is HasScanOSSResults {
    return 'scanOSSResults' in data && data.scanOSSResults instanceof Map;
}

@injectable()
export class ScanOSSScanButtonAction implements CodePartRendererAction {
    @inject(ScanOSSService)
    protected readonly scanService: ScanOSSService;
    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    priority = 30;

    canRender(response: CodeChatResponseContent, parentNode: ResponseNode): boolean {
        if (!hasScanOSSResults(parentNode.response.data)) {
            parentNode.response.data.scanOSSResults = new Map<
                string,
                ScanOSSResult
            >();
        }
        const results = parentNode.response.data
            .scanOSSResults as ScanOSSResults;
        const scanOSSMode = this.preferenceService.get(SCANOSS_MODE_PREF, 'off');
        // we mark the code for manual scanning in case it was not handled yet and the mode is manual or off.
        // this prevents a possibly unexpected automatic scan of "old" snippets if automatic scan is later turned on.
        if (results.get(response.code) === undefined && (scanOSSMode === 'off' || scanOSSMode === 'manual')) {
            results.set(response.code, false);
        }
        return scanOSSMode !== 'off';
    }

    render(
        response: CodeChatResponseContent,
        parentNode: ResponseNode
    ): ReactNode {
        const scanOSSResults = parentNode.response.data
            .scanOSSResults as ScanOSSResults;

        return (
            <ScanOSSIntegration
                key='scanoss'
                code={response.code}
                scanService={this.scanService}
                scanOSSResults={scanOSSResults}
                preferenceService={this.preferenceService}
            />
        );
    }
}

const ScanOSSIntegration = React.memo((props: {
    code: string;
    scanService: ScanOSSService;
    scanOSSResults: ScanOSSResults;
    preferenceService: PreferenceService;
}) => {
    const [automaticCheck] = React.useState(() =>
        props.preferenceService.get<string>(SCANOSS_MODE_PREF, 'off') === 'automatic'
    );
    const [scanOSSResult, setScanOSSResult] = React.useState<
        ScanOSSResult | 'pending' | undefined | false
    >(props.scanOSSResults.get(props.code));
    const scanCode = React.useCallback(async () => {
        setScanOSSResult('pending');
        const result = await props.scanService.scanContent(props.code, props.preferenceService.get(SCAN_OSS_API_KEY_PREF, undefined));
        setScanOSSResult(result);
        props.scanOSSResults.set(props.code, result);
        return result;
    }, [props.code, props.scanService]);

    React.useEffect(() => {
        if (scanOSSResult === undefined) {
            if (automaticCheck) {
                scanCode();
            } else {
                // sanity fallback. This codepath should already be handled via "canRender"
                props.scanOSSResults.set(props.code, false);
            }
        }
    }, []);
    const scanOSSClicked = React.useCallback(async () => {
        let scanResult = scanOSSResult;
        if (scanResult === 'pending') {
            return;
        }
        if (!scanResult || scanResult.type === 'error') {
            scanResult = await scanCode();
        }
        if (scanResult && scanResult.type === 'match') {
            const dialog = new ScanOSSDialog(scanResult);
            dialog.open();
        }
    }, [scanOSSResult]);
    let title = 'SCANOSS - Perform scan';
    if (scanOSSResult) {
        if (scanOSSResult === 'pending') {
            title = 'SCANOSS - Performing scan...';
        } else if (scanOSSResult.type === 'error') {
            title = `SCANOSS - Error - ${scanOSSResult.message}`;
        } else if (scanOSSResult.type === 'match') {
            title = `SCANOSS - Found ${scanOSSResult.matched} match`;
        } else if (scanOSSResult.type === 'clean') {
            title = 'SCANOSS - No match';
        }
    }
    return (
        <>
            <div
                className={`button scanoss-logo show-check icon-container ${scanOSSResult === 'pending'
                    ? 'pending'
                    : scanOSSResult
                        ? scanOSSResult.type
                        : ''
                    }`}
                title={title}
                role="button"
                onClick={scanOSSClicked}
            >
                <div className="codicon codicon-circle placeholder" />
                {scanOSSResult && scanOSSResult !== 'pending' && (
                    <span className="status-icon">
                        {scanOSSResult.type === 'clean' && <span className="codicon codicon-pass-filled" />}
                        {scanOSSResult.type === 'match' && <span className="codicon codicon-warning" />}
                        {scanOSSResult.type === 'error' && <span className="codicon codicon-error" />}
                    </span>
                )}
            </div>
        </>
    );
});

export class ScanOSSDialog extends ReactDialog<void> {
    protected readonly okButton: HTMLButtonElement;

    constructor(protected result: ScanOSSResultMatch) {
        super({
            title: 'SCANOSS Results',
        });
        this.appendAcceptButton(Dialog.OK);
        this.update();
    }

    protected render(): React.ReactNode {
        return (
            <div className="scanoss-dialog-container">
                {this.renderHeader()}
                {this.renderSummary()}
                {this.renderContent()}
            </div>
        );
    }

    protected renderHeader(): React.ReactNode {
        return (
            <div className="scanoss-header">
                <div className="scanoss-logo-container">
                    <div className="scanoss-logo"></div>
                    <h2>SCANOSS</h2>
                </div>
            </div>
        );
    }

    protected renderSummary(): React.ReactNode {
        return (
            <div className="scanoss-summary">
                <h3>Summary</h3>
                <div>
                    Found a {this.result.matched} match in{' '}
                    <a href={this.result.url} target="_blank" rel="noopener noreferrer">
                        {this.result.url}
                    </a>
                </div>
            </div>
        );
    }

    protected renderContent(): React.ReactNode {
        return (
            <div className="scanoss-details">
                <h4>Details</h4>
                <pre>
                    {
                        // eslint-disable-next-line no-null/no-null
                        JSON.stringify(this.result.raw, null, 2)
                    }
                </pre>
            </div>
        );
    }

    get value(): undefined {
        return undefined;
    }
}
