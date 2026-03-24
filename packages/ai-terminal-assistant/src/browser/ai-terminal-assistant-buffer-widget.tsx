// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { codicon, ReactWidget } from '@theia/core/lib/browser';
import { SummaryService } from './ai-terminal-assistant-service';
import { nls } from '@theia/core/lib/common/nls';

/**
 * Widget for displaying terminal buffer content.
 * Follows Theia widget best practices with proper ID, label, and lifecycle management.
 */
@injectable()
export class AiTerminalBufferWidget extends ReactWidget {

    public static ID = 'ai-terminal-buffer-widget';
    static LABEL = nls.localize('theia/ai/terminal/buffer/label', 'Terminal Buffer');

    @inject(SummaryService)
    protected readonly summaryService: SummaryService;

    constructor() {
        super();
        this.id = AiTerminalBufferWidget.ID;
        this.title.label = AiTerminalBufferWidget.LABEL;
        this.title.caption = AiTerminalBufferWidget.LABEL;
        this.title.iconClass = codicon('terminal');
        this.title.closable = true;
        this.node.classList.add('ai-terminal-buffer-widget');
    }

    @postConstruct()
    protected init(): void {
        this.update();
    }

    protected override render(): React.ReactNode {
        return (
            <AiTerminalBuffer summaryService={this.summaryService} />
        );
    }

}

interface AiTerminalBufferProps {
    summaryService: SummaryService;
}

const AiTerminalBuffer: React.FunctionComponent<AiTerminalBufferProps> = ({ summaryService }: AiTerminalBufferProps) => {

    const { buffer, isInputDisabled } = useTerminalBuffer(summaryService);
    const [inputCommand, setInputCommand] = React.useState<string>('');

    const handleExecuteTerminalCommand = React.useCallback(async () => {
        if (inputCommand.trim() !== '') {
            await summaryService.writeToCurrentTerminal(inputCommand);
            setInputCommand('');
        }
    }, [inputCommand, summaryService]);

    // const handleToggleTerminalVisibility = React.useCallback(() => {
    //     summaryService.toggleTerminalVisibility();
    // }, [summaryService]);

    return (
        <div>
            {/* <button className='theia-button secondary toggle-terminal-visibility-button' onClick={handleToggleTerminalVisibility}>
                Toggle Terminal Visibility
            </button> */}
            <div>
                <div className='ai-terminal-buffer-container'>
                    {buffer.map((line, index) => (
                        <p
                            key={index}
                            className='ai-terminal-command-line'
                        >{line}</p>
                    ))}
                </div>
                <form className='ai-terminal-input-form' onSubmit={e => (
                    e.preventDefault(),
                    handleExecuteTerminalCommand()
                )
                }>
                    <input
                        className='ai-terminal-input-field'
                        name='commandInput'
                        value={inputCommand}
                        placeholder='Enter command: '
                        disabled={isInputDisabled}
                        onChange={e => setInputCommand(e.target.value)}
                    />
                </form>
            </div>
        </div>
    );
};

function useTerminalBuffer(summaryService: SummaryService): {
    buffer: string[];
    isInputDisabled: boolean;
} {
    const [buffer, setBuffer] = React.useState<string[]>([]);
    const [isInputDisabled, setIsInputDisabled] = React.useState<boolean>(true);

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

    const updateInputDisabledStateToDisabled = React.useCallback(() => {
        setIsInputDisabled(true);
    }, [summaryService]);

    const updateInputDisabledStateToEnabled = React.useCallback(() => {
        setIsInputDisabled(false);
    }, [summaryService]);

    React.useEffect(() => {
        const onTaskStartedDisposable = summaryService.onTaskStarted(updateInputDisabledStateToEnabled);
        const onTaskExitedDisposable = summaryService.onTaskExited(updateInputDisabledStateToDisabled);
        return () => {
            onTaskStartedDisposable.dispose();
            onTaskExitedDisposable.dispose();
        };
    }, [summaryService]);

    return { buffer, isInputDisabled };
}
