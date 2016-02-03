import * as util from "gulp-util";
import * as _ from "underscore";
import * as path from "path";
import * as fs from  "fs";
import * as os from "os";
import * as childProcess from "child_process";
import {Promise} from "es6-promise";
import * as glob from "glob";
import File = require("vinyl");

import {packageDescriptorPlugin} from "./utilities/PackageDescriptorPlugin";
import {PluginError, PluginErrorOptions} from "./utilities/PluginError";
import {NpmWorkspacePluginOptions, getWorkspacePluginOptions} from "../NpmWorkspacePluginOptions";
import {PackageDescriptor} from "../PackageDescriptor";
import {ConditionableAction, AsyncAction, executeAsynchronousActions} from "./ConditionableAction";
import {Logger} from "./utilities/Logging";

/**
 * Options for buildTypeScriptProject().
 */
export interface TypeScriptCompileOptions {
    /**
     * true to continue streaming 'package.json' files if the TypeScript compilation yields errors.
     *
     * Defaults to true.
     */
    continueOnError?: boolean;

    /**
     * true to compile only those source files that are affected by change.
     *
     * Defaults to true.
     */
    fastCompile?: boolean;

    /**
     * A combination of a condition and an action that will be executed once the package has been compiled.
     */
    postCompileActions?: Array<ConditionableAction<AsyncAction>>;
}

const TSC_ARGS_FILENAME: string = "_args.tmp";

enum FileMode {
    Inclusion,
    Exclusion
}

/**
 * Provides context for the buildTypeScriptProject Gulp plugin.
 */
class TypeScriptCompilerBinding {
    /**
     * Initialises the new binding object.
     *
     * @param options The options that are to be associated with the running plugin implementation.
     */
    constructor(public options: TypeScriptCompileOptions & NpmWorkspacePluginOptions) {
    }

    /**
     * Retrieves the TypeScript compiler configuration ('tsconfig.json') for the current package descriptor by
     * either calling the 'getTypeScriptCompilerConfig()' function defined in the 'gulp.workspace.js' file
     * associated with the package, or loading the the package's tsconfig.json file.
     *
     * @param file The Gulp file.
     * @param packagePath The path to the package.
     *
     * @returns An array of objects representing the 'tsconfig.json' configuration objects for the given
     * package.
     */
    public getTypeScriptCompilerConfiguration(file: File, packagePath: string): Array<Object> {
        return(file["getWorkspace"]()["getTypeScriptCompilerConfig"]
               || function(): Array<Object> {
                    return glob.sync("./tsconfig*.json", { cwd: packagePath }).map((file) => require(path.resolve(packagePath, file)));
              })();
    }

    public createTypeScriptArgsFile(packagePath: string, argsFileName: string, compilerOptions: Object, fileMode: FileMode, filesOrFolders: string[], callback: Function): void {
        let fileStream = fs.createWriteStream(path.join(packagePath, argsFileName));

        fileStream.once("finish", () =>
        {
            callback();
        });

        for (let compilerOption in compilerOptions) {
            if (typeof compilerOptions[compilerOption] === "string") {
                fileStream.write(`--${compilerOption} ${compilerOptions[compilerOption]} `);
            }
            else {
                if ((<boolean>compilerOptions[compilerOption])) {
                    fileStream.write(`--${compilerOption} `);
                }
            }
        }

        if (fileMode === FileMode.Inclusion) {
            filesOrFolders.forEach((srcFile) => {
                fileStream.write(`${os.EOL}\"${srcFile}\"`);
            });
        }
        else {
            glob.sync("./*.ts", { cwd: packagePath, nosort: true }).forEach((srcFile) => {
                fileStream.write(`${os.EOL}\"${srcFile}\"`);
            });

            let packageFolders: Array<string> = _.filter(fs.readdirSync(packagePath), (p) => fs.statSync(path.join(packagePath, p)).isDirectory());
            let srcFolders: Array<string> = _.difference(packageFolders, filesOrFolders); // remove the excluded folders

            srcFolders.forEach((srcFolder) => {
                glob.sync(`./${srcFolder}/**/*.ts`, { cwd: packagePath, nosort: true }).forEach((srcFile) => {
                    fileStream.write(`${os.EOL}\"${srcFile}\"`);
                });
            });
        }

        fileStream.end();
    }

    public shellExecuteTsc(packagePath: string, compilerArgs: Array<string> = [ ]): void {
        let hasLocalTypeScript = fs.existsSync(path.join(packagePath, "node_modules", "typescript"));
        let result = childProcess.spawnSync(path.join(hasLocalTypeScript ? "." : "..", "node_modules/.bin", process.platform === "win32" ? "tsc.cmd" : "tsc"), compilerArgs, { cwd: packagePath });

        if (result.error) throw new Error("Could not locate a TypeScript compiler.");

        if (result.status !== 0) throw new Error(result.stdout.toString());
    }
}

/**
 * Creates a binding for the [[buildTypeScriptProject]] plugin.
 *
 * @returns An [[TypeScriptCompilerBinding]] object.
 */
function buildTypeScriptPackageBinding(options?: TypeScriptCompileOptions & NpmWorkspacePluginOptions): TypeScriptCompilerBinding {
    return new TypeScriptCompilerBinding(_.extend(getWorkspacePluginOptions(options), { continueOnError: true, fastCompile: true }, options));
}

/**
 * The [[buildTypeScriptProject]] plugin implementation.
 *
 * @param packageDescriptor The package descriptor representing the 'package.json' file.
 * @param packagePath The path to the package.
 */
function buildTypeScriptPackage(packageDescriptor: PackageDescriptor, packagePath: string, file: File): Promise<void> {
    let pluginBinding: TypeScriptCompilerBinding = this;

    return new Promise<void>((resolve, reject) => {
        try {
            let typeScriptConfigurations = pluginBinding.getTypeScriptCompilerConfiguration(file, packagePath);

            if (!typeScriptConfigurations || typeScriptConfigurations.length === 0) {
                Logger.warn("Could not find a 'tsconfig.json' file.");

                return resolve();
            }

            Logger.info(util.colors.bold(`Compiling workspace package '${util.colors.cyan(packageDescriptor.name)}'`));

            let tscArgFilePromises = typeScriptConfigurations.map((typeScriptConfiguration, idx) => new Promise<string>((resolve, reject) => {
                let argsFileName = `_${idx.toString()}_${TSC_ARGS_FILENAME}`;

                let compilerOptions = typeScriptConfiguration["compilerOptions"] || { };
                let fileMode = typeScriptConfiguration["files"] ? FileMode.Inclusion
                                                                : FileMode.Exclusion;
                let filesOrFolders
                    = fileMode === FileMode.Inclusion ? typeScriptConfiguration["files"] || [ ]
                                                      : typeScriptConfiguration["exclude"] || [ ];

                pluginBinding.createTypeScriptArgsFile(packagePath, argsFileName, compilerOptions, fileMode, filesOrFolders, () => {
                    Logger.verbose((logger) => {
                        logger(`Compiler options: ${JSON.stringify(compilerOptions)}`);

                        if (fileMode === FileMode.Exclusion) {
                            filesOrFolders.forEach((exclFolder) => { logger(`Excluding folder '${util.colors.blue(exclFolder)}'`); });
                        }
                    });

                    resolve(argsFileName);
                });
            }));

            Promise.all(tscArgFilePromises).then((argsFileNames: string[]) => {
                try {
                    argsFileNames.forEach((argsFileName) => {
                        pluginBinding.shellExecuteTsc(packagePath, [ `@${argsFileName}` ])
                    });

                    let postCompileActions: ConditionableAction<AsyncAction>[]
                        = _.union(pluginBinding.options.postCompileActions, file["getWorkspace"]()["postTypeScriptCompile"]);

                    if (postCompileActions && postCompileActions.length > 0) {
                        Logger.verbose(`Running post-compile actions for workspace package '${util.colors.cyan(packageDescriptor.name)}'`);

                        executeAsynchronousActions(postCompileActions, packageDescriptor, packagePath)
                            .then(resolve)
                            .catch((error) => {
                                handleError(error, packageDescriptor.name, pluginBinding.options.continueOnError, reject);
                            });
                    }
                    else {
                        resolve();
                    }
                }
                finally {
                    argsFileNames.forEach((argsFileName) => {
                        fs.unlinkSync(path.join(packagePath, argsFileName));
                    });
                }
            })
            .catch((error) => {
                handleError(error, packageDescriptor.name, pluginBinding.options.continueOnError, reject);
            });

        }
        catch (error) {
            handleError(error, packageDescriptor.name, pluginBinding.options.continueOnError, reject);
        }
    });
}

function handleError(error: any, packageName: string, continueOnError: boolean, rejectFunc: (error?: any) => void) {
    rejectFunc(new PluginError("Cannot compile a workspace package",
                               `Cannot compile workspace package '${util.colors.cyan(packageName)}':\n${util.colors.red(error.message)}`,
                               { continue: continueOnError }));
}

/**
 * A Gulp plugin that accepts and returns a stream of 'package.json' files and executes the TypeScript compiler for
 * each one.
 *
 * @param options A optional hash of [[TypeScriptCompileOptions]].
 *
 * @returns A stream that contains the 'package.json' files.
 */
export var buildTypeScriptProject: (options?: TypeScriptCompileOptions & NpmWorkspacePluginOptions) => NodeJS.ReadWriteStream = packageDescriptorPlugin(buildTypeScriptPackage, buildTypeScriptPackageBinding);
