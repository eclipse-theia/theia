import 'reflect-metadata';
import * as path from 'path';
import { Container, injectable } from "inversify";
import * as express from 'express';
import { BackendApplication, ExpressContribution, applicationModule } from "theia/lib/application/node";
import { fileSystemServerModule } from "theia/lib/filesystem/node";
import { messagingModule } from "theia/lib/messaging/node";
import { nodeLanguagesModule } from 'theia/lib/languages/node';
import { nodeJavaModule } from 'theia/lib/java/node';
import { nodePythonModule } from 'theia/lib/languages/python/node/node-python-module';

// FIXME introduce default error handler contribution
process.on('uncaughtException', function (err: any) {
    console.error('Uncaught Exception: ', err.toString());
    if (err.stack) {
        console.error(err.stack);
    }
});

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
container.load(nodeLanguagesModule);
container.load(nodeJavaModule);
container.load(nodePythonModule);
container.bind(ExpressContribution).to(StaticServer);
const application = container.get(BackendApplication);
application.start();
