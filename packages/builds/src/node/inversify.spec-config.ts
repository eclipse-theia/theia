/* Inversivy config file */
import { Container /*, interfaces */ } from "inversify";
import { IErrorParser, ErrorParser } from "./error-parser";

const testContainer = new Container();

testContainer.bind<ErrorParser>(IErrorParser).to(ErrorParser);

export { testContainer };
