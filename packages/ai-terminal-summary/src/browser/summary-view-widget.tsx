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
import * as React from 'react';
import { codicon, ReactWidget } from '@theia/core/lib/browser';
import { nls } from '@theia/core/lib/common/nls';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { AIActivationService } from '@theia/ai-core/lib/browser';
import { SummaryService } from './summary-service';
import { Summary, ErrorDetail } from './ai-terminal-summary-agent';
import { SummaryRendererRegistry } from './summary-renderer-registry';
export namespace SummaryViewWidget {
    export interface State {
        locked?: boolean;
        temporaryLocked?: boolean;
    }
}

@injectable()
export class SummaryViewWidget extends ReactWidget {

    public static ID = 'summary-view-widget';
    static LABEL = nls.localize('theia/ai/summary/view/label', 'AI Summary');

    @inject(AIActivationService)
    protected readonly aiActivationService: AIActivationService;

    @inject(SummaryService)
    protected readonly summaryService: SummaryService;

    @inject(SummaryRendererRegistry)
    protected readonly summaryRendererRegistry: SummaryRendererRegistry;

    protected isEnabled: boolean = false;

    constructor() {
        super();
        this.id = SummaryViewWidget.ID;
        this.title.label = SummaryViewWidget.LABEL;
        this.title.caption = SummaryViewWidget.LABEL;
        this.title.iconClass = codicon('sparkle');
        this.title.closable = true;
        this.node.classList.add('summary-view-widget');
        this.update();
    }

    public setEnabled(enabled: boolean): void {
        this.isEnabled = enabled;
        this.update();
    }

    @postConstruct()
    protected init(): void {
        this.toDispose.push(this.aiActivationService.onDidChangeActiveStatus(() => {
            this.setEnabled(this.aiActivationService.isActive);
        }));
        this.setEnabled(this.aiActivationService.isActive);
        this.toDispose.push(this.summaryRendererRegistry.onDidChange(() => this.update()));
        this.update();
    }

    protected override render(): React.ReactNode {
        return <TerminalOutputSummary summaryService={this.summaryService} renderRegistry={this.summaryRendererRegistry}></TerminalOutputSummary>;
    }

}
const TerminalOutputSummary: React.FunctionComponent<{ summaryService: SummaryService, renderRegistry: SummaryRendererRegistry }> = ({ summaryService, renderRegistry }) => {

    const sparkleIcon = codicon('sparkle');

    const [summary, setSummary] = React.useState<Summary | undefined>(undefined);
    const [loading, setLoading] = React.useState<boolean>(false);

    React.useEffect(() => {
        const handleBuildFinished = () => handleRequestSummary();
        summaryService.onBuildFinished(handleBuildFinished);

        return () => {
            summaryService.onBuildFinished(handleBuildFinished);
        };
    }, [summaryService]);

    const handleRequestSummary = async () => {
        setLoading(true);
        const summary = await summaryService.sendSummaryRequestForLastUsedTerminal();
        setSummary(summary);
        setLoading(false);
    };

    return (
        <div className='summary-view-container'>
            <div className='summary-view-header'>
                <div className={sparkleIcon}></div>
                <div>Terminal Output Summary:</div>
            </div>
            {
                loading ? <div>Loading...</div> :
                    !summary ? <div>Request a summary by clicking the button below.</div> :
                        <div>
                            <BuildResultOverview summary={summary} />
                            <ErrorOverviewList errors={summary.errors} />
                        </div>
            }

            <div className='button-group'>
                <RequestSummaryButton onRequestSummary={handleRequestSummary} />
                {summary && Array.from(renderRegistry.renderers).map((RendererComponent, index) => {
                    return <RendererComponent key={index} />;
                })}
            </div>
        </div>
    );
};

const BuildResultOverview: React.FunctionComponent<{ summary: Summary }> = ({ summary }) => {

    const listIcon = codicon('list-unordered');
    const errorIcon = codicon('error');
    const successIcon = codicon('pass');

    return (
        <div className='build-result-container'>
            <div className='build-result-header'>
                <div className={listIcon}></div>
                <div>Build Result</div>
            </div>
            <div className='build-result-status'>
                {
                    summary.isBuildSuccessful ?
                        'Build successful' :
                        'Build failed'}
                {
                    summary.isBuildSuccessful ?
                        <div className={successIcon}></div> :
                        <div className={errorIcon}></div>
                }
            </div>
            <div className='build-result-content'>
                {summary.outputSummary}
            </div>
        </div>
    );
}

const ErrorOverviewList: React.FunctionComponent<{ errors: ErrorDetail[] }> = ({ errors }) => {

    return (
        <div className='error-overview-list'>
            {errors.map((error, index) => (
                <ErrorOverview key={index} errorDetail={error} />
            ))}
        </div>
    );

}

const ErrorOverview: React.FunctionComponent<{ errorDetail: ErrorDetail }> = ({ errorDetail }) => {

    const errorIcon = codicon('error');
    const fileIcon = codicon('file');
    const bookIcon = codicon('book');
    const checkIcon = codicon('check');
    const chevronDownIcon = codicon('chevron-down');
    const chevronRightIcon = codicon('chevron-right');

    const [dropdownOpen, setDropdownOpen] = React.useState<boolean>(false);

    const handleToggleDropdown = React.useCallback(() => {
        setDropdownOpen(!dropdownOpen);
    }, [dropdownOpen]);

    return (
        <div className='error-detail-container'>
            <div className='error-detail-header' onClick={handleToggleDropdown}>
                <div className={errorIcon} />
                <div>{errorDetail.type}</div>
                {
                    dropdownOpen ? <div className={chevronDownIcon} /> : <div className={chevronRightIcon} />
                }
            </div>
            {
                dropdownOpen && (
                    <div className='error-detail-body'>
                        <div className='error-detail-field'>
                            <div className={fileIcon} />
                            <div className='error-detail-content'>
                                <div className='error-detail-subheader'>File</div>
                                <div>{errorDetail.location}</div>
                            </div>
                        </div>
                        <div className='error-detail-field'>
                            <div className={bookIcon} />
                            <div className='error-detail-content'>
                                <div className='error-detail-subheader'>Description</div>
                                <div>{errorDetail.description}</div>
                            </div>
                        </div>
                        <div className='error-detail-field'>
                            <div className={checkIcon} />
                            <div className='error-detail-content'>
                                <div className='error-detail-subheader'>Fix</div>
                                <div>{errorDetail.fix}</div>
                            </div>
                        </div>
                    </div>
                )
            }
        </div>
    );

}

const RequestSummaryButton: React.FunctionComponent<{ onRequestSummary: () => void }> = ({ onRequestSummary }) => {

    return (
        <button className='theia-button' onClick={onRequestSummary}>
            Request Summary
        </button>
    );
}
