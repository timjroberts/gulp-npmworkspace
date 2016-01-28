"use strict";

import * as through from "through2";

/**
 * A base utility class that creates a stream over workspace package descriptors
 * ('package.json' files).
 */
export abstract class PackageDescriptorStreamFactory {
    public static readStreamAsync(stream: NodeJS.ReadableStream): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            stream.on("finish", () => {
                resolve();
            });
            stream.on("error", (error: Error) => {
                reject(error);
            });

            stream.on("data", () => { });
        });
    }

    /**
     * Creates a stream of package descriptors.
     *
     * @returns A stream that contains the 'package.json' files as they are received..
     */
    public createStream(): NodeJS.ReadWriteStream {
        return through.obj((file, encoding, callback) => {
            this.onHandleWorkspacePackage(file, JSON.parse(file.contents.toString()));

            callback(null, file);
        });
    }

    /**
     * Called when the created stream receives a package descriptor.
     *
     * @param file The file object received.
     * @param packageDescriptor The deserialised package descriptor taken from the file.
     */
    protected onHandleWorkspacePackage(file: any, packageDescriptor: any): void {
    }
}


/**
 * A package descriptor stream factory that applies an action to each received package descriptor.
 */
export class PackageDescriptorActionStreamFactory extends PackageDescriptorStreamFactory {
    /**
     * Initialises a new package descriptor stream factory.
     *
     * @param actionFunc The function that will be invoked for each received package descriptor in
     * the stream.
     */
    constructor(private actionFunc: (packageDescriptor: any) => void) {
        super();
    }

    /**
     * Overrides [[PackageDescriptorStreamFactory#onHandleWorkspacePackage]] and calls the current
     * package descriptor action function fof the supplied package descriptor.
     *
     * @param file The file object received (ignored).
     * @param packageDescriptor The deserialised package descriptor taken from the file.
     */
    protected onHandleWorkspacePackage(file: any, packageDescriptor: any): void {
        this.actionFunc(packageDescriptor);
    }
}
