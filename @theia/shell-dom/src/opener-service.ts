import {multiInject, injectable} from "inversify";

export const IOpenerService = Symbol("IOpenerService");

export interface IOpenerService {
    /**
     * Open a resource for the given input.
     * Return undefined if this service cannot handle the given input.
     */
    open<ResourceInput, Resource>(input: ResourceInput): Promise<Resource> | undefined;
}

@injectable()
export class OpenerService implements IOpenerService {

    constructor(@multiInject(IOpenerService) protected readonly services: IOpenerService[]) {
    }

    open<ResourceInput, Resource>(input: ResourceInput): Promise<Resource> | undefined {
        for (const service of this.services) {
            const promise = service.open(input);
            if (promise) {
                return promise;
            }
        }
        return undefined;
    }

}
