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
import { codicon, ReactWidget, StatefulWidget } from '@theia/core/lib/browser';
import { nls } from '@theia/core/lib/common/nls';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { AIActivationService } from '@theia/ai-core/lib/browser';
import { SummaryService } from './ai-terminal-assistant-service';
import { Summary, ErrorDetail, ErrorLines } from './terminal-output-analysis-agent';
import { AiTerminalAssistantCommandService } from './ai-terminal-assistant-command-service';
import { MarkdownRenderer } from '@theia/core/lib/browser/markdown-rendering/markdown-renderer';
import { MarkdownStringImpl } from '@theia/core/lib/common/markdown-rendering';
import { Command } from '@theia/core';

/**
 * State interface for persisting widget state between sessions.
 */
export interface SummaryViewWidgetState {
    lastSummary?: Summary;
    isEnabled: boolean;
}

/**
 * Main widget for AI Terminal Assistant.
 * Implements StatefulWidget for state persistence between sessions.
 * Uses ReactWidget for React-based rendering.
 */
@injectable()
export class SummaryViewWidget extends ReactWidget implements StatefulWidget {

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
    protected lastSummary?: Summary;

    constructor() {
        super();
        this.id = SummaryViewWidget.ID;
        this.title.label = SummaryViewWidget.LABEL;
        this.title.caption = SummaryViewWidget.LABEL;
        this.title.iconClass = codicon('sparkle');
        this.title.closable = true;
        this.node.classList.add('summary-view-widget');
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

    /**
     * Store widget state for persistence between sessions.
     * Implements StatefulWidget interface.
     */
    storeState(): SummaryViewWidgetState {
        return {
            lastSummary: this.lastSummary,
            isEnabled: this.isEnabled
        };
    }

    /**
     * Restore widget state from previous session.
     * Implements StatefulWidget interface.
     */
    restoreState(oldState: SummaryViewWidgetState): void {
        if (oldState.lastSummary) {
            this.lastSummary = oldState.lastSummary;
        }
        this.isEnabled = oldState.isEnabled ?? false;
        this.update();
    }

    protected override render(): React.ReactNode {
        return <TerminalOutputSummary
            summaryService={this.summaryService}
            commandService={this.commandService}
            markdownRenderer={this.markdownRenderer}
            onSummaryChange={this.handleSummaryChange}
        />;
    }

    protected handleSummaryChange = (summary: Summary | undefined): void => {
        this.lastSummary = summary;
    };
}

interface TerminalOutputSummaryProps {
    summaryService: SummaryService;
    commandService: AiTerminalAssistantCommandService;
    markdownRenderer: MarkdownRenderer;
    onSummaryChange?: (summary: Summary | undefined) => void;
};

interface ErrorOverviewProps {
    errorDetail: ErrorDetail;
    onOpenError: (error: ErrorDetail) => void;
    commands: Command[];
    onExecuteCommand: (commandId: string, error: ErrorDetail) => void;
    onRenderMarkdown: (content: string) => React.ReactNode;
};

interface ErrorDetailHeaderProps {
    errorDetail: ErrorDetail;
    onDropdownToggle: () => void;
    isDropdownOpen: boolean;
    onOpenError: (error: ErrorDetail) => void;
    commands: Command[];
    onExecuteCommand: (commandId: string, error: ErrorDetail) => void;
    onRenderMarkdown: (content: string) => React.ReactNode;
};

interface ErrorDetailBodyProps {
    errorDetail: ErrorDetail;
    isDropdownOpen: boolean;
    onRenderMarkdown: (content: string) => React.ReactNode;
};

interface BuildResultOverviewProps {
    summary: Summary;
    onRenderMarkdown: (content: string) => React.ReactNode;
};

interface AddOnButtonsProps {
    onExecuteCommand: (commandId: string, error: ErrorDetail) => void;
    commands: Command[];
    error: ErrorDetail;
};

const TerminalOutputSummary: React.FunctionComponent<TerminalOutputSummaryProps> = ({ summaryService, commandService, markdownRenderer, onSummaryChange }:
    TerminalOutputSummaryProps) => {
    const { loading, summary } = useSummaryData(summaryService, onSummaryChange);

    const handleOpenError = React.useCallback(async (error: ErrorDetail) => {
        await summaryService.openErrorInEditor(error);
    }, [summaryService]);

    const handleExecuteCommand = React.useCallback((commandId: string, error: ErrorDetail) => {
        commandService.executeCommand(commandId, error);
    }, [commandService]);

    const renderMarkdown = React.useCallback((content: string) => <Markdown content={content} markdownRenderer={markdownRenderer}></Markdown>, [markdownRenderer]);

    const commands = commandService.commands;

    const isWelcome = !loading && !summary;

    return (
        <div className={`summary-view-container${isWelcome ? ' welcome-state' : ''}`}>
            {loading ?
                <div className='summary-loading'>
                    <span className={`${codicon('loading')} theia-animation-spin`}></span>
                    <span>Analyzing terminal output...</span>
                </div> :
                summary ?
                    <div className='ai-summary-container'>
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
                    <WelcomeView />
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
    const [dropdownOpen, setDropdownOpen] = React.useState<boolean>(true);

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
                onRenderMarkdown={onRenderMarkdown}
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

const ErrorDetailHeader: React.FunctionComponent<ErrorDetailHeaderProps> =
    ({
        errorDetail,
        commands,
        onOpenError,
        onExecuteCommand,
        onRenderMarkdown,
        onDropdownToggle,
        isDropdownOpen,
    }: ErrorDetailHeaderProps) => {
        const chevronDownIcon = codicon('chevron-down');
        const chevronRightIcon = codicon('chevron-right');
        const lineText = typeof errorDetail.line === 'number' ? `:${errorDetail.line}` : '';

        return (
            <div className='error-detail-header'>
                <div className='error-detail-dropdown' onClick={onDropdownToggle}>
                    {isDropdownOpen ? <div className={chevronDownIcon} /> : <div className={chevronRightIcon} />}
                    <div className='error-detail-header-title'>
                        <span className='error-type'>{errorDetail.type}</span>
                        {errorDetail.file && <span className='error-location'>{onRenderMarkdown(errorDetail.file + lineText)}</span>}
                    </div>
                </div>
                <div className='ai-terminal-button-group'>
                    {errorDetail.file && <OpenErrorInEditorButton onOpenError={() => onOpenError(errorDetail)} />}
                    <AddOnButtons onExecuteCommand={onExecuteCommand} error={errorDetail} commands={commands} />
                </div>
            </div>
        );
    };

const ErrorDetailBody: React.FunctionComponent<ErrorDetailBodyProps> = ({ errorDetail, isDropdownOpen, onRenderMarkdown }: ErrorDetailBodyProps) => {
    const [fixDropdownOpen, setFixDropdownOpen] = React.useState<boolean>(false);

    const chevronDownIcon = codicon('chevron-down');
    const chevronRightIcon = codicon('chevron-right');

    const handleToggleFixDropdown = React.useCallback(() => {
        setFixDropdownOpen(prev => !prev);
    }, []);

    return (
        isDropdownOpen && (
            <div className={`error-detail-body ${isDropdownOpen ? 'open' : 'closed'}`}>
                <div className='error-detail-field'>
                    {
                        errorDetail.errorLines && errorDetail.errorLines.errorLines.length > 0 &&
                        <ErrorContext errorLines={errorDetail.errorLines} errorIndex={errorDetail.line ?? -1} />
                    }
                </div>
                <div className='error-detail-field'>
                    {/* <span className='error-detail-subheader'>Description:</span> */}
                    <ul className='error-explanation-steps'>
                        {errorDetail.explanationSteps.map((step, idx) => (
                            <li key={idx}>
                                {onRenderMarkdown(step)}
                            </li>
                        ))}
                    </ul>
                </div>
                <div className='error-detail-divider' />
                <div className='error-detail-field'>
                    <div className='error-detail-content'>
                        <div
                            className='error-detail-dropdown'
                            onClick={handleToggleFixDropdown}
                        >
                            {fixDropdownOpen ? <div className={chevronDownIcon} /> : <div className={chevronRightIcon} />}
                            <span className='error-detail-subheader'>Fix (click to expand)</span>
                        </div>
                        {fixDropdownOpen && (
                            <ol className='error-fix-steps'>
                                {errorDetail.fixSteps.map((step, idx) => (
                                    <li key={idx}>
                                        {onRenderMarkdown(step)}
                                    </li>
                                ))}
                            </ol>
                        )}
                    </div>
                </div>
            </div>
        )
    );
};

const ErrorContext: React.FunctionComponent<{ errorLines: ErrorLines, errorIndex: number }> = ({ errorLines, errorIndex }) => {
    const isErrorLine = (index: number) => errorLines.errorLinesStart + index === errorIndex;
    return <div className='error-lines-container'>
        {
            errorLines.errorLines.map((line, index) => (
                <p
                    key={index}
                    className={`ai-terminal-command-line ${isErrorLine(index) ? 'error-line' : ''}`}
                >{line}</p>
            ))
        }
    </div>;
};

// const RequestSummaryButton: React.FunctionComponent<{ onRequestSummary: () => void, disabled?: boolean }> = ({ onRequestSummary, disabled }:
// { onRequestSummary: () => void, disabled?: boolean }) => {
//     const playButton = codicon('play');
//     return (
//         <button className='theia-button icon-button request-summary-button' onClick={onRequestSummary} disabled={disabled}>
//             <div className={playButton} />
//             Request Summary
//         </button>
//     );
// }

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
            {commands.map(command => (
                <button
                    key={command.id}
                    className='theia-button secondary'
                    onClick={() => onExecuteCommand(command.id, error)}
                >
                    <div className='ai-terminal-icon-button'>
                        <div className={chatSparkleIcon} />
                        {command.label}
                    </div>
                </button>
            ))
            }
        </>
    );
};

const WelcomeView: React.FunctionComponent = () => (
    <div className='ai-terminal-assistant-welcome'>
        <div className='ai-terminal-assistant-welcome-header'>
            <h3 className='ai-terminal-assistant-welcome-title'>AI Terminal Assistant</h3>
            <p className='ai-terminal-assistant-welcome-subtitle'>
                Automatically analyzes terminal output when a task or debug session finishes.
            </p>
        </div>
        <div className='ai-terminal-assistant-welcome-steps-section'>
            <span className='ai-terminal-assistant-welcome-steps-label'>How it works</span>
            <ul className='ai-terminal-assistant-welcome-steps'>
                <li>
                    <span className={codicon('play')} />
                    <span>Run a <strong>task</strong> via the Task Runner, or start a <strong>debug session</strong></span>
                </li>
                <li>
                    <span className={codicon('terminal')} />
                    <span>The assistant reads the terminal output once the run completes</span>
                </li>
                <li>
                    <span className={codicon('pass')} />
                    <span>Results appear here — build status, errors, and suggested fixes</span>
                </li>
            </ul>
        </div>
    </div>
);

const Markdown: React.FunctionComponent<{ content: string, markdownRenderer: MarkdownRenderer }> = ({ content, markdownRenderer }) => {
    const ref = useMarkdownRenderer(content, markdownRenderer);
    return <div ref={ref} className="markdown-content" />;
};

function useSummaryData(summaryService: SummaryService, onSummaryChange?: (summary: Summary | undefined) => void):
    {
        summary: Summary | undefined,
        loading: boolean,
        requestSummary: () => void
    } {
    const [summary, setSummary] = React.useState<Summary | undefined>(undefined);
    const [loading, setLoading] = React.useState<boolean>(false);
    const loadingRef = React.useRef(false);

    const handleRequestSummaryStarted = React.useCallback(() => {
        if (loadingRef.current) {
            return;
        }
        loadingRef.current = true;
        setLoading(true);
    }, []);

    const handleRequestSummaryFinished = React.useCallback(() => {
        try {
            const newSummary = summaryService.currentSummary;
            setSummary(newSummary);
            onSummaryChange?.(newSummary);
        } catch (error) {
            console.error('Error fetching terminal summary:', error);
        } finally {
            loadingRef.current = false;
            setLoading(false);
        }
    }, [summaryService, onSummaryChange]);

    React.useEffect(() => {
        const dispose = summaryService.onSummaryRequestStarted(handleRequestSummaryStarted);
        return () => dispose.dispose();
    }, [summaryService, handleRequestSummaryStarted]);

    React.useEffect(() => {
        const dispose = summaryService.onSummaryRequestFinished(handleRequestSummaryFinished);
        return () => dispose.dispose();
    }, [summaryService, handleRequestSummaryFinished]);

    return { summary, loading, requestSummary: handleRequestSummaryFinished };

}

function useMarkdownRenderer(content: string, markdownRenderer: MarkdownRenderer): React.RefObject<HTMLDivElement> {
    // eslint-disable-next-line
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
