import 'reflect-metadata';
import { Container } from "inversify";
import { applicationModule, BackendApplication } from "../../../application/node";
import { nodeLanguagesModule } from "../node-languages-module";
import { mockLanguageModule } from './mock-contribution';
import { inmemoryModule } from "../../../filesystem/common";

const container = new Container();
container.load(applicationModule);
container.load(inmemoryModule);
container.load(nodeLanguagesModule);
container.load(mockLanguageModule);
const application = container.get(BackendApplication);
application.start();
