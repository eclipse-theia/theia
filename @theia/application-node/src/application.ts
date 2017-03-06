import * as express from "express";
import { multiInject, injectable } from "inversify";

/**
 * The main entry point for Theia applications.
 */
@injectable()
export class BackendApplication {

    private app: express.Application;

    constructor(
        @multiInject(ExpressContribution) protected contributions: ExpressContribution[]) {
    }

    start(port: number = 3000): Promise<void> {
        this.app = express();
        for (let contrib of this.contributions) {
            contrib.configure(this.app);
        }
        return new Promise<void>((resolve => {
            this.app.listen(port, () => {
                console.log(`Theia app listening on port ${port}.`)
                resolve();
            })
        }));
    }
}

export const ExpressContribution = Symbol("ExpressContribution");

export interface ExpressContribution {
    configure(app: express.Application): void;
}