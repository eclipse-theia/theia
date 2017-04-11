import { DisposableCollection } from '../../application/common';
import { MessageReader, MessageWriter, Disposable, Message } from 'vscode-jsonrpc';

export interface IConnection extends Disposable {
    readonly reader: MessageReader;
    readonly writer: MessageWriter;
    forward(to: IConnection, map?: (message: Message) => Message): void;
    onClose(callback: () => void): Disposable;
}

export function createConnection(reader: MessageReader, writer: MessageWriter, onDispose: () => void): IConnection {
    const disposeOnClose = new DisposableCollection();
    reader.onClose(() => disposeOnClose.dispose());
    writer.onClose(() => disposeOnClose.dispose());
    return {
        reader, writer,
        forward(to: IConnection, map: (message: Message) => Message = (message) => message): void {
            reader.listen(input => {
                const output = map(input);
                to.writer.write(output)
            });
        },
        onClose(callback: () => void): Disposable {
            return disposeOnClose.push(Disposable.create(callback));
        },
        dispose: () => onDispose()
    }
}
