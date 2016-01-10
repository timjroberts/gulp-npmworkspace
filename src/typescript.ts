import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import * as childProcess from "child_process";
import * as util from "gulp-util";
import * as through from "through2";
import * as _ from "underscore";
import * as glob from "glob";
import File = require("vinyl");

import {ArgumentOptions,
        PackageDescriptor,
        PreCompileAction} from "./interfaces";

import {TypeScriptCompileOptions} from "./options";
import {pluginName, Logger} from "./plugin";

const TSC_ARGS_FILENAME: string = "__args.tmp";
const TSCONFIG_FILENAME: string = "tsconfig.json";


/**
 * Accepts and returns a stream of 'package.json' files and executes the TypeScript compiler for each one.
 *
 * @param options A hash of options.
 */
export function buildTypeScriptProject(options?: TypeScriptCompileOptions): NodeJS.ReadWriteStream {
    options = _.defaults(options || { }, { continueOnError: true, fastCompile: true, includeTypings: true });

    return through.obj(function(file: File, encoding, callback) {
        if (file.isStream()) return callback(new util.PluginError(pluginName, "Streams not supported."));

        let pathInfo = path.parse(file.path);

        if (pathInfo.base !== "package.json") return callback(new util.PluginError(pluginName, "Expected a 'package.json' file."));

        let packageDescriptor: PackageDescriptor = JSON.parse(file.contents.toString());

        let localTypeScriptConfigPath = path.join(pathInfo.dir, TSCONFIG_FILENAME);
        let hasLocalTypeScriptConfig = fs.existsSync(localTypeScriptConfigPath);

        if (!hasLocalTypeScriptConfig) {
            Logger.warn(util.colors.yellow(`Cannot compile workspace package '${packageDescriptor.name}'. Could not find a 'tsconfig.json' file.`));

            return callback(null, file);
        }

        Logger.info(`Compiling workspace package '${util.colors.cyan(packageDescriptor.name)}'`);

        let localTypeScriptConfig = require(localTypeScriptConfigPath);

        let compilerOptions = localTypeScriptConfig.compilerOptions || { };
        let excludedFolders: Array<string> = localTypeScriptConfig.exclude || [ ];

        Logger.verbose((logger) => {
            logger(`TypeScript compiler options: ${JSON.stringify(compilerOptions)}`);

            excludedFolders.forEach((exclFolder) => { logger(`Excluding folder '${util.colors.blue(exclFolder)}'`); });
        });

        // Call the TypeScript compiler (taking into account the options.fastCompile setting)

        let preCompileAction: PreCompileAction
            = options.fastCompile ? createTscArgsFile : nullPreCompileAction;
        let tscCmdLineArgs
            = options.fastCompile ? [ "@" + TSC_ARGS_FILENAME ] : [ ];

        preCompileAction(pathInfo.dir, compilerOptions, excludedFolders, () => {
            try {
                shellExecuteTsc(pathInfo.dir, tscCmdLineArgs);

                callback(null, file);
            }
            catch (error) {
                let message = `Compilation failed for workspace package '${util.colors.cyan(packageDescriptor.name)}'`;

                Logger.error(message + os.EOL + util.colors.red(error.message));

                callback(options.continueOnError ? null
                                                : new util.PluginError(pluginName, message, { showProperties: false, showStack: false}),
                        file);
            }
            finally {
                if (options.fastCompile) fs.unlinkSync(path.join(pathInfo.dir, TSC_ARGS_FILENAME));
            }
        });
    });
}


/**
 * Shells out to the TypeScript compiler. If a compiler is installed in the workspace pacakge then that
 * version is used over the version that is installed in the workspace.
 *
 * @param packagePath The path to the root of the package.
 * @param compilerArgs An array of arguments to pass to the compiler.
 */
function shellExecuteTsc(packagePath: string, compilerArgs: Array<string> = [ ]): void {
    let hasLocalTypeScript = fs.existsSync(path.join(packagePath, "node_modules", "typescript"));
    let result = childProcess.spawnSync(path.join(hasLocalTypeScript ? "." : "..", "node_modules/.bin", process.platform === "win32" ? "tsc.cmd" : "tsc"), compilerArgs, { cwd: packagePath });

    if (result.error) throw new Error("Could not locate a TypeScript compiler.");

    if (result.status !== 0) throw new Error(result.stdout.toString());
}


/**
 * A PreCompileAction that performs no action (simply calls onCompleteFunc()).
 */
function nullPreCompileAction(packagePath: string, compilerOptions: Object, excludedFolders: Array<string>, onCompleteFunc: Function): void {
    onCompleteFunc();
}


/**
 * A PreCompileAction implementation that generates a TypeScript 'args' file.
 *
 * @param packagePath The path to the root of the package.
 * @param compilerOptions A hash of the TypeScript compiler options.
 * @excludedFolders An array of folders that should be excluded from compilation.
 * @onCompleteFunc The callback to invoke when the pre-compilation action is complete.
 */
function createTscArgsFile(packagePath: string, compilerOptions: Object, excludedFolders: Array<string>, onCompleteFunc: Function): void {
    let fileStream = fs.createWriteStream(path.join(packagePath, TSC_ARGS_FILENAME));

    fileStream.once("finish", () =>
    {
        onCompleteFunc();
    });

    for (let compilerOption in compilerOptions) {
        if (typeof compilerOptions[compilerOption] === "string") {
            fileStream.write(`--${compilerOption} ${compilerOptions[compilerOption]} `);
        }
        else {
            fileStream.write(`--${compilerOption} `);
        }
    }

    glob.sync(`./*.ts`, { cwd: packagePath }).forEach((srcFile) => {
        fileStream.write(`${os.EOL}\"${srcFile}\"`);
    });

    let packageFolders: Array<string> = _.filter(fs.readdirSync(packagePath), (p) => fs.statSync(path.join(packagePath, p)).isDirectory());
    let srcFolders: Array<string> = _.difference(packageFolders, excludedFolders); // remove the excluded folders

    srcFolders.forEach((srcFolder) => {
        glob.sync(`./${srcFolder}/**/*.ts`, { cwd: packagePath }).forEach((srcFile) => {
            fileStream.write(`${os.EOL}\"${srcFile}\"`);
        });
    });

    fileStream.end();
}
