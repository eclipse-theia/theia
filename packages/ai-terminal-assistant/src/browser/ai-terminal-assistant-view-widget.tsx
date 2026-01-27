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
import { MarkdownRenderer } from '@theia/core/lib/browser/markdown-rendering/markdown-renderer';
import { MarkdownStringImpl } from '@theia/core/lib/common/markdown-rendering';
import { Command } from '@theia/core';

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

    @inject(MarkdownRenderer)
    protected readonly markdownRenderer: MarkdownRenderer;

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
        return <TerminalOutputSummary summaryService={this.summaryService} commandService={this.commandService} markdownRenderer={this.markdownRenderer}></TerminalOutputSummary>;
    }

}

type TerminalOutputSummaryProps = {
    summaryService: SummaryService;
    commandService: AiTerminalAssistantCommandService;
    markdownRenderer: MarkdownRenderer;
};

type ErrorOverviewProps = {
    errorDetail: ErrorDetail;
    onOpenError: (error: ErrorDetail) => void;
    commands: Command[];
    onExecuteCommand: (commandId: string, error: ErrorDetail) => void;
    onRenderMarkdown: (content: string) => React.ReactNode;
};

type ErrorDetailHeaderProps = {
    errorDetail: ErrorDetail;
    onDropdownToggle: () => void;
    isDropdownOpen: boolean;
    onOpenError: (error: ErrorDetail) => void;
    commands: Command[];
    onExecuteCommand: (commandId: string, error: ErrorDetail) => void;
};

type ErrorDetailBodyProps = {
    errorDetail: ErrorDetail;
    isDropdownOpen: boolean;
    onRenderMarkdown: (content: string) => React.ReactNode;
};

type BuildResultOverviewProps = {
    summary: Summary;
    onRenderMarkdown: (content: string) => React.ReactNode;
};

type AddOnButtonsProps = {
    onExecuteCommand: (commandId: string, error: ErrorDetail) => void;
    commands: Command[];
    error: ErrorDetail;
};

const TerminalOutputSummary: React.FunctionComponent<TerminalOutputSummaryProps> = ({ summaryService, commandService, markdownRenderer }: TerminalOutputSummaryProps) => {
    const { loading, summary, requestSummary: handleRequestSummary } = useSummaryData(summaryService);
    const { buffer } = useTerminalBuffer(summaryService);
    const [inputCommand, setInputCommand] = React.useState<string>('');

    const handleOpenError = React.useCallback(async (error: ErrorDetail) => {
        await summaryService.openErrorInEditor(error);
    }, [summaryService]);

    const handleExecuteCommand = React.useCallback((commandId: string, error: ErrorDetail) => {
        commandService.executeCommand(commandId, error);
    }, [commandService]);

    const handleExecuteTerminalCommand = React.useCallback(async () => {
        if (inputCommand.trim() !== '') {
            await summaryService.writeToCurrentTerminal(inputCommand);
            setInputCommand('');
        }
    }, [inputCommand, summaryService]);

    const renderMarkdown = React.useCallback((content: string) => {
        return <Markdown content={content} markdownRenderer={markdownRenderer}></Markdown>
    }, [markdownRenderer]);

    const handleToggleTerminalVisibility = React.useCallback(() => {
        summaryService.toggleTerminalVisibility();
    }, [summaryService]);

    const commands = commandService.commands;

    return (
        <div className='summary-view-container'>
            <button className='theia-button secondary toggle-terminal-visibility-button' onClick={handleToggleTerminalVisibility}>
                Toggle Terminal Visibility
            </button>
            <div className='terminal-buffer-container'>
                {buffer.map((line, index) => (
                    <p
                        key={index}
                        className='command-line'
                    >{line}</p>
                ))}
            </div>
            <form className='command-input-form' onSubmit={(e) => (
                e.preventDefault(),
                handleExecuteTerminalCommand()
            )
            }>
                <input
                    className='command-input-field'
                    name='commandInput'
                    value={inputCommand}
                    placeholder='Enter command: '
                    onChange={(e) => setInputCommand(e.target.value)}
                />
            </form>
            <div className='summary-view-header'>
                {!summary && <div>Start a build or request a summary manually by clicking the 'Request Summary' button.</div>}
                <RequestSummaryButton onRequestSummary={handleRequestSummary} disabled={loading} />
            </div>
            {loading ? <div>Loading...</div> :
                summary ?
                    <div className={`ai-summary-container ${summary.isSuccessful ? 'success-container-border' : 'error-container-border'}`}>
                        <BuildResultOverview
                            summary={summary}
                            onRenderMarkdown={renderMarkdown}
                        />
                        <div className='error-overview-list'>
                            {summary.errors.map((error, index) =>
                                <ErrorOverview
                                    key={index}
                                    errorDetail={error}
                                    onExecuteCommand={handleExecuteCommand}
                                    onRenderMarkdown={renderMarkdown}
                                    onOpenError={handleOpenError}
                                    commands={commands}
                                />
                            )}
                        </div>
                    </div> :
                    // eslint-disable-next-line no-null/no-null
                    null
            }
        </div>
    );
};

const BuildResultOverview: React.FunctionComponent<BuildResultOverviewProps> = ({ summary, onRenderMarkdown }: BuildResultOverviewProps) => {
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
            {onRenderMarkdown(summary.outputSummary)}
        </div>
    );
};

const ErrorOverview: React.FunctionComponent<ErrorOverviewProps> = ({ errorDetail, onOpenError, onExecuteCommand, commands, onRenderMarkdown }: ErrorOverviewProps) => {
    const [dropdownOpen, setDropdownOpen] = React.useState<boolean>(false);

    const handleToggleDropdown = React.useCallback(() => {
        setDropdownOpen(prev => !prev);
    }, []);

    return (
        <div className='error-detail-container'>
            <ErrorDetailHeader
                errorDetail={errorDetail}
                onDropdownToggle={handleToggleDropdown}
                isDropdownOpen={dropdownOpen}
                onOpenError={onOpenError}
                onExecuteCommand={onExecuteCommand}
                commands={commands}
            />
            <ErrorDetailBody
                errorDetail={errorDetail}
                isDropdownOpen={dropdownOpen}
                onRenderMarkdown={onRenderMarkdown}
            >
            </ErrorDetailBody>
        </div>
    );

};

const ErrorDetailHeader: React.FunctionComponent<ErrorDetailHeaderProps> = ({ errorDetail, commands, onOpenError, onExecuteCommand, onDropdownToggle, isDropdownOpen }: ErrorDetailHeaderProps) => {
    const chevronDownIcon = codicon('chevron-down');
    const chevronRightIcon = codicon('chevron-right');

    return (
        <div className='error-detail-header'>
            <div
                className='error-detail-dropdown'
                onClick={onDropdownToggle}
            >
                {isDropdownOpen ? <div className={chevronDownIcon} /> : <div className={chevronRightIcon} />}
                <div>{errorDetail.type}</div>
            </div>
            <div className='button-group'>
                {errorDetail.file && <OpenErrorInEditorButton onOpenError={() => onOpenError(errorDetail)} />}
                <AddOnButtons onExecuteCommand={onExecuteCommand} error={errorDetail} commands={commands} />
            </div>
        </div>
    );
}

const ErrorDetailBody: React.FunctionComponent<ErrorDetailBodyProps> = ({ errorDetail, isDropdownOpen, onRenderMarkdown }: ErrorDetailBodyProps) => {
    const lineText = typeof errorDetail.line === 'number' ? `, Line ${errorDetail.line}` : '';

    return (
        isDropdownOpen && (
            <div className={`error-detail-body ${isDropdownOpen ? "open" : "closed"}`}>
                {
                    errorDetail.file &&
                    <div className='error-detail-field'>
                        <div className='error-detail-content'>
                            <span className='error-detail-subheader'>File:</span>{' '}
                            {onRenderMarkdown(`${errorDetail.file}${lineText}`)}
                        </div>
                    </div>
                }
                <div className='error-detail-divider' />
                <div className='error-detail-field'>
                    <div className='error-detail-content'>
                        <span className='error-detail-subheader'>Description:</span>
                        <ul className='error-explanation-steps'>
                            {errorDetail.explanationSteps.map((step, idx) => (
                                <li key={idx}>
                                    {onRenderMarkdown(step)}
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
                <div className='error-detail-divider' />
                <div className='error-detail-field'>
                    <div className='error-detail-content'>
                        <span className='error-detail-subheader'>Fix:</span>
                        <ol className='error-fix-steps'>
                            {errorDetail.fixSteps.map((step, idx) => (
                                <li key={idx}>
                                    {onRenderMarkdown(step)}
                                </li>
                            ))}
                        </ol>
                    </div>
                </div>
            </div>
        )
    )
}

const RequestSummaryButton: React.FunctionComponent<{ onRequestSummary: () => void, disabled?: boolean }> = ({ onRequestSummary, disabled }: { onRequestSummary: () => void, disabled?: boolean }) => {
    const playButton = codicon('play');
    return (
        <button className='theia-button icon-button request-summary-button' onClick={onRequestSummary} disabled={disabled}>
            <div className={playButton} />
            Request Summary
        </button>
    );
}

const OpenErrorInEditorButton: React.FunctionComponent<{ onOpenError: () => void }> = ({ onOpenError }: { onOpenError: () => void }) => {
    const goToFileIcon = codicon('go-to-file');
    return (
        <button className='theia-button secondary icon-button' onClick={onOpenError}>
            <div className={goToFileIcon} />
            Open in Editor
        </button>
    );
};

const AddOnButtons: React.FunctionComponent<AddOnButtonsProps> = ({ onExecuteCommand, commands, error }: AddOnButtonsProps) => {
    const chatSparkleIcon = codicon('chat-sparkle');
    if (!commands || commands.length === 0) {
        // eslint-disable-next-line no-null/no-null
        return null;
    }
    return (
        <>
            {commands.map((command) => (
                <button
                    key={command.id}
                    className='theia-button secondary'
                    onClick={() => onExecuteCommand(command.id, error)}
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


const Markdown: React.FunctionComponent<{ content: string, markdownRenderer: MarkdownRenderer }> = ({ content, markdownRenderer }) => {
    const ref = useMarkdownRenderer(content, markdownRenderer);
    return <div ref={ref} className="markdown-content" />;
}

function useTerminalBuffer(summaryService: SummaryService) {
    const [buffer, setBuffer] = React.useState<string[]>([]);

    const fetchBuffer = React.useCallback(async () => {
        const bufferContent = await summaryService.getBufferContent();
        console.log('Fetched terminal buffer content:', bufferContent);
        setBuffer(bufferContent.reverse().filter(line => line.trim() !== ''));
    }, [summaryService]);

    React.useEffect(() => {
        fetchBuffer();
        const dispose = summaryService.onCurrentTerminalBufferChanged(fetchBuffer);
        console.log('Subscribed to terminal changes for buffer fetching.');
        return () => dispose.dispose();
    }, [summaryService, fetchBuffer]);

    return { buffer, fetchBuffer };
}

function useSummaryData(summaryService: SummaryService) {
    const [summary, setSummary] = React.useState<Summary | undefined>(undefined);
    const [loading, setLoading] = React.useState<boolean>(false);
    const loadingRef = React.useRef(false);

    const handleRequestSummary = React.useCallback(async () => {
        if (loadingRef.current) {
            return;
        }
        loadingRef.current = true;
        setLoading(true);
        try {
            const summary = await summaryService.sendSummaryRequestForLastUsedTerminal();
            setSummary(summary);
        } catch (error) {
            console.error('Error fetching terminal summary:', error);
        } finally {
            loadingRef.current = false;
            setLoading(false);
        }
    }, [summaryService]);

    React.useEffect(() => {
        const dispose = summaryService.onBuildFinished(handleRequestSummary);
        return () => dispose.dispose();
    }, [summaryService, handleRequestSummary]);

    return { summary, loading, requestSummary: handleRequestSummary };

}

function useMarkdownRenderer(content: string, markdownRenderer: MarkdownRenderer) {
    const ref = React.useRef<HTMLDivElement>(null);
    React.useEffect(() => {
        if (ref.current && content) {
            const markdownString = new MarkdownStringImpl(content);
            const result = markdownRenderer.render(markdownString);
            ref.current.replaceChildren(result.element);
            return () => result.dispose();
        }
    }, [content, markdownRenderer]);
    return ref;
}
