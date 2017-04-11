import * as path from "path";
import { ContainerModule, injectable } from "inversify";
import { NodeConnectionProvider, NodeModule } from 'vscode-languageclient/lib/nodeConnection';
import { BaseLanguageClient } from "../../common";
import { LanguageContribution } from '../language-contribution';
import { IConnection } from "../../../messaging/common";

export const mockLanguageModule = new ContainerModule(bind => {
    bind(LanguageContribution).to(MockLanguage);
});

@injectable()
export class MockLanguage implements LanguageContribution {

    readonly id = 'mock';

    listen(clientConnection: IConnection): void {
        // TODO
    }

    createLanguageClient(services: BaseLanguageClient.IServices): BaseLanguageClient {
        const module = path.resolve(__dirname, '../../../../lib/languages/node/test/mock-language-server.js');
        return new BaseLanguageClient({
             name: 'Mock Language Server',
             clientOptions: {},
             services,
             connectionProvider: new NodeConnectionProvider({
                 workspace: services.workspace,
                 serverOptions: <NodeModule>{
                     module
                 }
             })
        })
    }

}
