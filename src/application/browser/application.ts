import "reflect-metadata";
import { Application } from "@phosphor/application";
import { ApplicationShell } from "./shell";
import {injectable, multiInject, inject, interfaces} from "inversify";
import {CommandRegistry} from "../common/command";

export const TheiaPlugin = Symbol("TheiaPlugin");
/**
 * Clients can subclass to get a callback for contributing widgets to a shell on start.
 */
export interface TheiaPlugin {

    /**
     * Callback
     */
    onStart(app: TheiaApplication): void;
}

@injectable()
export class TheiaApplication {

    readonly shell: ApplicationShell;
    private application: Application<ApplicationShell>;
    private container: interfaces.Container | undefined;

    constructor(
        @inject(CommandRegistry) commandRegistry: CommandRegistry,
        @multiInject(TheiaPlugin) contributions: TheiaPlugin[]) {

        this.shell = new ApplicationShell();
        this.application = new Application<ApplicationShell>({
            shell: this.shell
        });
        this.application.started.then(() => {
            contributions.forEach(c => c.onStart(this));
        })
    }

    start(container?: interfaces.Container): Promise<void> {
        this.container = container;
        return this.application.start();
    }

    // FIXME kittaakos: This is a huge hack. Do not use this, please. Once we introduce some
    // sort of a lazy handler resolution for the commands, we will get rid of this method.
    // https://github.com/TypeFox/Theia/issues/34
    getService<T>(serviceIdentifier: interfaces.ServiceIdentifier<T>): T | undefined {
        if (this.container) {
            return this.container.get(serviceIdentifier);
        }
        return undefined;
    }

}
