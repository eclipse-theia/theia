/* Inversivy config file */
import { Container /*, interfaces */ } from "inversify";
import { IOutputParser, OutputParser } from "./output-parser";

const testContainer = new Container();

testContainer.bind<OutputParser>(IOutputParser).to(OutputParser);

export { testContainer };
