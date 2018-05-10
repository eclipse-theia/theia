# Theia - Core extension

## Logging configuration

It's possible to change the log level for the entire Theia application by
passing it the `--log-level={fatal,error,warn,info,debug,trace}` option.  For
more fine-grained adjustment, it's also possible to set the log level per
logger (i.e. per topic).  The `root` logger is a special catch-all logger
through which go all messages not sent through a particular logger.  To change
the log level of particular loggers, create a config file such as

```json
{
  "defaultLevel": "info",
  "levels": {
    "terminal": "debug",
    "task": "error"
  }
}
```

where `levels` contains the logger-to-log-level mapping.  `defaultLevel`
contains the log level to use for loggers not specified in `levels`.  This file
can then be specified using the `--log-config` option.  Theia will watch that
file for changes, so it's possible to change log levels at runtime by
modifying this file.

It's unfortunately currently not possible to query Theia for the list of
existing loggers.  However, each log message specifies from which logger it
comes from, which can give an idea, without having to read the code:

```
[2018-05-10T20:01:45.608Z]  INFO: Theia/7045 on elxacz23q12: (logger=root)
                            ^^^^                                     ^^^^
			 log level                                logger name
```

## License
[Apache-2.0](https://github.com/theia-ide/theia/blob/master/LICENSE)
