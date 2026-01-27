import * as React from 'react';
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

type AiTerminalBufferProps = {
    summaryService: SummaryService;
}

const AiTerminalBuffer: React.FunctionComponent<AiTerminalBufferProps> = ({ summaryService }: AiTerminalBufferProps) => {

    const { buffer } = useTerminalBuffer(summaryService);
    const [inputCommand, setInputCommand] = React.useState<string>('');

    const handleExecuteTerminalCommand = React.useCallback(async () => {
        if (inputCommand.trim() !== '') {
            await summaryService.writeToCurrentTerminal(inputCommand);
            setInputCommand('');
        }
    }, [inputCommand, summaryService]);


    const handleToggleTerminalVisibility = React.useCallback(() => {
        summaryService.toggleTerminalVisibility();
    }, [summaryService]);

    return (
        <div>
            <button className='theia-button secondary toggle-terminal-visibility-button' onClick={handleToggleTerminalVisibility}>
                Toggle Terminal Visibility
            </button>
            <div>
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
            </div>
        </div>
    )
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
