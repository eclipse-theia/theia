import "reflect-metadata";
import {BackendApplication, ExpressContribution, applicationModule} from "theia/lib/application/node";
import {Container, injectable} from "inversify";
import * as express from "express";
import {fileSystemServerModule} from "theia/lib/filesystem/node";
import {messagingModule} from "theia/lib/messaging/node";
import * as path from "path";

@injectable()
class StaticServer implements ExpressContribution {
    configure(app: express.Application): void {
        app.use(express.static(path.join(__dirname, 'web')));
    }
}

const container = new Container();
container.load(applicationModule);
container.load(messagingModule);
container.load(fileSystemServerModule);
container.bind(ExpressContribution).to(StaticServer);
const application = container.get(BackendApplication);
application.start();

