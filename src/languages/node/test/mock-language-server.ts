import {
    IPCMessageReader, IPCMessageWriter,
    createConnection, IConnection,
    TextDocuments, InitializeResult
} from 'vscode-languageserver';

const connection: IConnection = createConnection(new IPCMessageReader(process), new IPCMessageWriter(process));

const documents: TextDocuments = new TextDocuments();
documents.listen(connection);

let workspaceRoot: string | null | undefined;
connection.onInitialize((params): InitializeResult => {
    workspaceRoot = params.rootPath;
    return {
        capabilities: {
            textDocumentSync: documents.syncKind
        }
    }
});

connection.listen();
