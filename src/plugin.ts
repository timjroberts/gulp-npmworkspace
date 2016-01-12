import * as util from "gulp-util";

import {ArgumentOptions,
        PackageDescriptor} from "./interfaces";

/**
 * The plugin name.
 */
export const pluginName = (<PackageDescriptor>require("../package.json")).name;

/**
 * An object that contains a hash of the associated command line options.
 */
export const argv: ArgumentOptions
    = require("yargs")
    .alias("p", "package")
    .alias("v", "verbose")
    .argv;

export function argvProjectName(): string {
    if (!argv.package) return undefined;

    let matches = /^(\!?)(.+)/g.exec(argv.package);

    return (!matches || !matches[2]) ? undefined : matches[2];
}

export function argvExclusiveProjectName(): string {
    if (!argv.package) return undefined;

    let matches = /^\!(.+)/g.exec(argv.package);

    return (!matches) ? undefined : matches[1];
}

export interface LogTextFunc {
    (logFunc: (message: string | Chalk.ChalkChain) => void): void;
}

export class Logger {
    public static error(message: string | Chalk.ChalkChain): void {
        util.log(message);
    }

    public static warn(message: string | Chalk.ChalkChain): void {
        util.log(message);
    }

    public static info(message: string | Chalk.ChalkChain): void {
        util.log(message);
    }

    public static verbose(message: string | Chalk.ChalkChain | LogTextFunc): void {
        if (argv.verbose) {
            if (typeof message === "function") {
                return (<LogTextFunc>message)(util.log);
            }

            util.log(message);
        }
    }
}
