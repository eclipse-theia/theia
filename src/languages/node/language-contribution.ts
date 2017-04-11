import { IConnection } from "../../messaging/common";

export const LanguageContribution = Symbol('LanguageContribution');

export interface LanguageContribution {
    readonly id: string;
    listen(clientConnection: IConnection): void;
}
