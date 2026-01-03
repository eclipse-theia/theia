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
import { codicon, ReactWidget } from '@theia/core/lib/browser';
import { nls } from '@theia/core/lib/common/nls';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { AIActivationService } from '@theia/ai-core/lib/browser';
import { SummaryService } from './ai-terminal-assistant-service';
import { Summary, ErrorDetail } from './terminal-output-analysis-agent';
import { AiTerminalAssistantCommandService } from './ai-terminal-assistant-command-service';
export namespace SummaryViewWidget {
    export interface State {
        locked?: boolean;
        temporaryLocked?: boolean;
    }
}

@injectable()
export class SummaryViewWidget extends ReactWidget {

    public static ID = 'summary-view-widget';
    static LABEL = nls.localize('theia/ai/summary/view/label', 'AI Terminal Assistant');

    @inject(AIActivationService)
    protected readonly aiActivationService: AIActivationService;

    @inject(SummaryService)
    protected readonly summaryService: SummaryService;

    @inject(AiTerminalAssistantCommandService)
    protected readonly commandService: AiTerminalAssistantCommandService;

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
        return <TerminalOutputSummary summaryService={this.summaryService} commandService={this.commandService}></TerminalOutputSummary>;
    }

}

type TerminalOutputSummaryProps = {
    summaryService: SummaryService;
    commandService: AiTerminalAssistantCommandService;
};

type ErrorOverviewListProps = {
    errors: ErrorDetail[];
    commandService: AiTerminalAssistantCommandService;
    handleOpenErrorInEditor: (error: ErrorDetail) => void;
};

type ErrorOverviewProps = {
    errorDetail: ErrorDetail;
    commandService: AiTerminalAssistantCommandService;
    handleOpenErrorInEditor: (error: ErrorDetail) => void;
};

type AddOnButtonsProps = {
    commandService: AiTerminalAssistantCommandService;
    error: ErrorDetail;
};

const TerminalOutputSummary: React.FunctionComponent<TerminalOutputSummaryProps> = ({ summaryService, commandService }: TerminalOutputSummaryProps) => {
    const [summary, setSummary] = React.useState<Summary | undefined>(undefined);
    //const [error, setError] = React.useState<Error | undefined>(undefined);
    const [loading, setLoading] = React.useState<boolean>(false);

    React.useEffect(() => {
        const dispose = summaryService.onBuildFinished(handleRequestSummary);
        return () => dispose.dispose();
    }, [summaryService]);

    const handleRequestSummary = async () => {
        if (loading) {
            return;
        }
        setLoading(true);
        try {
            const summary = await summaryService.sendSummaryRequestForLastUsedTerminal();
            setSummary(summary);
        } catch (error) {
            console.error('Error fetching terminal summary:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleOpenErrorInEditor = async (error: ErrorDetail) => {
        // try {
        await summaryService.openErrorInEditor(error);
        // } catch (error) {
        //     setError(error as Error);
        // }
    };

    return (
        <div className='summary-view-container'>
            <div className='summary-view-header'>
                {!summary ? <div>Start a build or request a summary manually by clicking the 'Request Summary' button.</div> : <div></div>}
                <RequestSummaryButton onRequestSummary={handleRequestSummary} disabled={loading} />
            </div>
            {loading ? <div>Loading...</div> :
                summary ?
                    <div className={`ai-summary-container ${summary.isSuccessful ? 'success-container-border' : 'error-container-border'}`}>
                        <BuildResultOverview summary={summary} />
                        <ErrorOverviewList errors={summary.errors} commandService={commandService} handleOpenErrorInEditor={handleOpenErrorInEditor} />
                    </div> : <div></div>
            }
        </div>
    );
};

const BuildResultOverview: React.FunctionComponent<{ summary: Summary }> = ({ summary }: { summary: Summary }) => {

    const errorIcon = codicon('error');
    const successIcon = codicon('pass');

    const isSuccessful = summary.isSuccessful;
    const statusText = isSuccessful ? 'Build successful' : 'Build failed';
    const statusIcon = isSuccessful ? successIcon : errorIcon;

    return (
        <div className='build-result-container'>
            <div className='build-result-status'>
                <div className={statusIcon} />
                {statusText}
            </div>
            <div className='build-result-content'>
                {summary.outputSummary}
            </div>
        </div>
    );
};

const ErrorOverviewList: React.FunctionComponent<ErrorOverviewListProps> = ({ errors, commandService, handleOpenErrorInEditor }: ErrorOverviewListProps) => (
    <div className='error-overview-list'>
        {errors.map((error, index) =>
            <ErrorOverview key={index} errorDetail={error} commandService={commandService} handleOpenErrorInEditor={handleOpenErrorInEditor} />
        )}
    </div>
);

const ErrorOverview: React.FunctionComponent<ErrorOverviewProps> = ({ errorDetail, commandService, handleOpenErrorInEditor }: ErrorOverviewProps) => {
    const chevronDownIcon = codicon('chevron-down');
    const chevronRightIcon = codicon('chevron-right');

    const [dropdownOpen, setDropdownOpen] = React.useState<boolean>(false);

    const handleToggleDropdown = React.useCallback(() => {
        setDropdownOpen(prev => !prev);
    }, []);

    const lineText = typeof errorDetail.line === 'number' ? `, Line ${errorDetail.line}` : '';

    return (
        <div className='error-detail-container'>
            <div
                className='error-detail-header'
                onClick={handleToggleDropdown}
            >
                {dropdownOpen ? <div className={chevronDownIcon} /> : <div className={chevronRightIcon} />}
                <div>{errorDetail.type}</div>
            </div>
            {dropdownOpen && (
                <div className={`error-detail-body ${dropdownOpen ? "open" : "closed"}`}>
                    {
                        errorDetail.file &&
                        <div className='error-detail-field'>
                            <div className='error-detail-content'>
                                <span className='error-detail-subheader'>File:</span>{' '}
                                {`${errorDetail.file}${lineText}`}
                            </div>
                        </div>
                    }
                    <div className='error-detail-field'>
                        <div className='error-detail-content'>
                            <span className='error-detail-subheader'>Description:</span>{' '}
                            {errorDetail.description}
                        </div>
                    </div>
                    <div className='error-detail-field'>
                        <div className='error-detail-content'>
                            <span className='error-detail-subheader'>Fix:</span>{' '}
                            {errorDetail.fix}
                        </div>
                    </div>
                </div>
            )
            }
            <div className='button-group'>
                {errorDetail.file && <OpenErrorInEditorButton handleOpenErrorInEditor={() => handleOpenErrorInEditor(errorDetail)} />}
                <AddOnButtons commandService={commandService} error={errorDetail} />
            </div>
        </div>
    );

};

const RequestSummaryButton: React.FunctionComponent<{ onRequestSummary: () => void, disabled?: boolean }> = ({ onRequestSummary, disabled }: { onRequestSummary: () => void, disabled?: boolean }) => {
    const playButton = codicon('play');
    return (
        <button className='theia-button icon-button' onClick={onRequestSummary} disabled={disabled}>
            <div className={playButton} />
            Request Summary
        </button>
    );
}

const OpenErrorInEditorButton: React.FunctionComponent<{ handleOpenErrorInEditor: () => void }> = ({ handleOpenErrorInEditor }: { handleOpenErrorInEditor: () => void }) => {
    const goToFileIcon = codicon('go-to-file');
    return (
        <button className='theia-button secondary icon-button' onClick={handleOpenErrorInEditor}>
            <div className={goToFileIcon} />
            Open in Editor
        </button>
    );
};

const AddOnButtons: React.FunctionComponent<AddOnButtonsProps> = ({ commandService, error }: AddOnButtonsProps) => {
    const chatSparkleIcon = codicon('chat-sparkle');
    const commands = commandService.commands;
    if (!commands || commands.length === 0) {
        return (<></>);
    }
    return (
        <>
            {commands.map((command, index) => (
                <button
                    key={index}
                    className='theia-button secondary'
                    onClick={() => commandService.executeCommand(command.id, error)}
                >
                    <div className='icon-button'>
                        <div className={chatSparkleIcon} />
                        {command.label}
                    </div>
                </button>
            ))
            }
        </>
    );
};
