/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import { injectable } from 'inversify';
import * as PEG from 'pegjs'

export const IMIParser = Symbol("IMIParser");

export interface IMIParser {
    parse(input: string): any;
}

@injectable()
export class MIParser {

    private parser: PEG.Parser;

    constructor() {
        let grammar: string;
        grammar
            = `
{
function flatten(arr) {
  const f = [].concat(...arr);
  return f.some(Array.isArray) ? flatten(f) : f;
}

/* Filter out the ,  in (, Result)* */
function getResults(arr) {
   return [].concat(...arr.map ((cur, index) => {
            return cur.filter ((element, index,array) => {
               return index % 2;
               });
            }));
}
}

start
   = outOfBandRecord:(OutOfBandRecord)* resultRecord:ResultRecord? '(gdb) ' NL {
      let resultObj = {};
      if (outOfBandRecord.length > 0) {
         resultObj = Object.assign(resultObj, { "outOfBandRecord": outOfBandRecord });
      }
      if (resultRecord != null) {
         resultObj = Object.assign(resultObj, { "resultRecord": resultRecord });
      }
      return resultObj
      }

   ResultRecord = ErrorResultRecord / OtherResultRecord

   ErrorResultRecord =  token:Token? '^error,' msg:('msg=' CString) code:(',code=' CString)? NL {
   let resultObj = { "type": "ErrorResultRecord", resultClass: "error" };
      if (msg != null) {
         resultObj = Object.assign (resultObj, { msg: msg[1] });
      }
      if (code != null) {
         resultObj = Object.assign (resultObj, { code: code[1] });
      }

      return resultObj;
   }

   OtherResultRecord = token:Token? '^' resultClass:ResultClass properties:(',' Result)* NL {
      let resultObj =  { "type": "ResultRecord", resultClass: resultClass, properties: getResults(properties) };
      if (token != null) {
         resultObj = Object.assign (resultObj, { token: token });
      }

      return resultObj;
   }

   ResultClass = 'done' / 'running' / 'connected' / 'error' / 'exit'

   OutOfBandRecord = AsyncRecord / StreamRecord

   AsyncRecord = ExecAsyncOutput / StatusAsyncOutput / NotifyAsyncOutput

   ExecAsyncOutput = token:Token? '*' parent:AsyncOutput NL {
         let child =  { type: "ExecAsyncOutput"}
         if (token != null) {
            child = Object.assign (child, { token: token });
         }
         return Object.assign (child, parent);
      }

   StatusAsyncOutput = token:Token? '+' parent:AsyncOutput NL {
         let child =  { type: "StatusAsyncOutput"}
         if (token != null) {
            child = Object.assign (child, { token: token });
         }
         return Object.assign (child, parent);
      }

   NotifyAsyncOutput = token:Token? '=' parent:AsyncOutput NL {
         let child =  { type: "NotifyAsyncOutput"}
         if (token != null) {
            child = Object.assign (child, { token: token });
         }
         return Object.assign (child, parent);
      }


   AsyncOutput = asyncClass:AsyncClass properties:(',' Result)* {
     return { asyncClass: asyncClass, properties: getResults(properties) }; }

   AsyncClass = str:([a-zA-Z][a-zA-Z0-9_-]+) { return flatten(str).join(""); }

   Result = variable:Variable "=" value:Value { return [ variable, value ] }

   Variable = String

   Value = Const / Tuple / List

   Const = CString

   Tuple = empty:'{}' / '{' first:Result (',' second:Result)* '}' {
         if (empty != undefined) {
            return [];
         } else {
            return [first, second];
         }
   }

   EmptyList = '[]' { return []; }

   ListValues = '[' first:Value others:(',' Value)* ']' {
      if (others !== null) {
         return [].concat(first,...getResults(others));
      } else {
         return [first];
      }
   }

   ListResults = '[' first:Result others:(',' Result)* ']' {
     let result = [];
     result.push(first);
     if (others != null) {
        result.push([].concat(...getResults(others)));
     }
     return result;
   }

   List = EmptyList / ListResults / ListValues

   Token = token:[0-9]+ { return parseInt(token.join(""), 10); }

   StreamRecord = ConsoleStreamOutput / TargetStreamOutput / LogStreamOutput

   LogStreamOutput = '&' cstring:CString NL
      { return { type: "LogStreamOutput", output: cstring }; }

   TargetStreamOutput = '@' cstring:CString NL
      { return { type: "TargetStreamOutput", output: cstring }; }

   ConsoleStreamOutput = '~' cstring:CString NL
      { return { type: "ConsoleStreamOutput", output: cstring }; }

   String = str:([A-Za-z_-][A-Za-z_0-9-]*) { return flatten(str).join(""); }

   CString = '"' cstring:('\\\\' . / [^"])* '"' {
      let str = flatten(cstring).join("");
      str = str.replace(/&amp/g,'&');
      str = str.replace(/&lt/g,'<');
      str = str.replace(/&gt/g,'>');
      str = str.replace(/&quot/g,'"');
      return str;
   }

   NL = '\\n' / '\\r\\n'
`
        try {
            this.parser = PEG.generate(grammar);
        } catch (error) {
            console.log(error.message);
        }
    }

    parse(input: string): any {
        try {
            return this.parser.parse(input);
        } catch (error) {
            console.log(`Error: ${error.message} while parsing string: ${input}`);
            throw error;
        }
    }

}
