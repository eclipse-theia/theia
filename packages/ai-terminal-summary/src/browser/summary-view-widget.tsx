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
        this.update();

    }
    protected override render(): React.ReactNode {
        return <TerminalOutputSummary summaryService={this.summaryService}></TerminalOutputSummary>;
    }

}
const TerminalOutputSummary: React.FunctionComponent<{ summaryService: SummaryService }> = ({ summaryService }) => {

    const sparkleIcon = codicon('sparkle');

    const [summary, setSummary] = React.useState<string>('');
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
                        <BuildResultOverview summary={summary} />
            }
            <RequestSummaryButton onRequestSummary={handleRequestSummary} />
        </div>
    );
};

const BuildResultOverview: React.FunctionComponent<{ summary: string }> = ({ summary }) => {

    const listIcon = codicon('list-unordered');

    return (
        <div className='build-result-container'>
            <div className='build-result-title'>
                <div className={listIcon}></div>
                <div>Build Result</div>
            </div>
            <p className='build-result-content'>
                {summary}
            </p>
        </div>
    );
}
const RequestSummaryButton: React.FunctionComponent<{ onRequestSummary: () => void }> = ({ onRequestSummary }) => {

    return (
        <button onClick={onRequestSummary}>
            Request Summary
        </button>
    );
}
