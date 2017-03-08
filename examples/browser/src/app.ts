require("reflect-metadata");

import {BackendApplication, ExpressContribution, applicationModule} from "theia/lib/application/node";
import {Container, injectable} from "inversify";
import * as express from "express";
import {fileSystemServerModule} from "theia/lib/filesystem/node";
import {wsModule} from "theia/lib/messaging/node";
import {FileSystem, Path, inmemoryModule} from "theia/lib/filesystem/common";
import path = require("path");

@injectable()
class StaticServer implements ExpressContribution {
    configure(app: express.Application): void {
        app.use(express.static(path.join(__dirname, 'web')));
    }
}

const container = new Container();
container.load(applicationModule);
container.load(inmemoryModule);
container.load(fileSystemServerModule);
container.load(wsModule);
container.bind(ExpressContribution).to(StaticServer);
const application = container.get(BackendApplication);
application.start();

const fileSystem = container.get<FileSystem>(FileSystem);

let index = 0;
let level = 0;
const dirName = 'foo';
let dirPath = dirName;
setInterval(() => {
    fileSystem.writeFile(Path.fromString(`${dirPath}/Foo_${index}.txt`), 'Hello World');
    index++;
    if (index === 10) {
        index = 0;
        level++;
        dirPath += `/${dirName}`;
    }
    if (level === 4) {
        level = 0;
        dirPath = dirName;
        fileSystem.rmdir(Path.fromString(dirPath));
    }
}, 500);
