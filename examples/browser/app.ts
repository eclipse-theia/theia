require("reflect-metadata");

import {BackendApplication, ExpressContribution, applicationModule} from "@theia/application-node";
import {Container, injectable} from "inversify";
import * as express from "express";
import path = require("path");

@injectable()
class StaticServer implements ExpressContribution {
    configure(app: express.Application): void {
        app.use(express.static(path.join(__dirname, 'web')));
    }
}

const container = new Container();
container.load(applicationModule);
container.bind(ExpressContribution).to(StaticServer);
const application = container.get(BackendApplication);
application.start();