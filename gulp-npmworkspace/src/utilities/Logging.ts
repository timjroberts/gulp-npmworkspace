import * as util from "gulp-util";

import {getVerboseLoggingFlag} from "./CommandLine";

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
        if (getVerboseLoggingFlag()) {
            if (typeof message === "function") {
                return (<LogTextFunc>message)(util.log);
            }

            util.log(message);
        }
    }
}