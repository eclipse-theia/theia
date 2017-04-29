import { decorate, injectable } from "inversify";
import { MonacoToProtocolConverter, ProtocolToMonacoConverter } from 'monaco-languageclient';

decorate(injectable(), MonacoToProtocolConverter);
decorate(injectable(), ProtocolToMonacoConverter);

export * from '../../../languages/common';

export {
    MonacoToProtocolConverter,
    ProtocolToMonacoConverter
}

export * from './monaco-languages';
export * from './monaco-workspace';