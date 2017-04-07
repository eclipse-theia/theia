import * as http from "http";
import { IConnection } from "vscode-languageserver";
import { IServerOptions } from '../../messaging/node';
import { LANGUAGES_WS_PATH, ConsoleWindow } from '../common';
import { RemoteWorkspace } from "./remote-workspace";
import { RemoteLanguages } from "./remote-languages";
import { Disposable, DisposableCollection } from '../../application/common';
import { LanguageContributor } from "./language-contributor";

export class LanguageConnectionHandler implements IServerOptions {

    readonly path = LANGUAGES_WS_PATH;
    protected readonly window = new ConsoleWindow();

    constructor(
        readonly server: http.Server,
        protected rootUri: string | null,
        protected readonly contributors: LanguageContributor[]
    ) {}

    onConnection(connection: IConnection): Disposable {
        const toDispose = new DisposableCollection();
        const workspace = new RemoteWorkspace(this.rootUri);
        toDispose.push(workspace);
        workspace.listen(connection);

        const languages = new RemoteLanguages();
        toDispose.push(languages);
        languages.listen(connection);

        connection.listen();

        const services = { workspace, languages, window: this.window };
        for (const contributor of this.contributors) {
            const languageClient = contributor.createLanguageClient(services);
            toDispose.push(languageClient.start());
        }
        return toDispose;
    }

}
