import crypto from "crypto";
import { promises as fs } from "fs";
import { PluginSettings, DEFAULT_SETTINGS } from "./settings";

export async function getFileHash(filePath: string): Promise<string> {
    const fileBuffer = await fs.readFile(filePath);
    return crypto.createHash("sha256").update(fileBuffer).digest("hex");
}

// Compare local and remote file hashes before syncing
export async function syncFiles(settings: PluginSettings = DEFAULT_SETTINGS) {
    const files = await getLocalFiles(); // Assume this function gets all local files

    const filesToSync = files.filter((file) => {
        const extension = file.split(".").pop();
        return (
            settings.includeFileTypes.includes(extension) &&
            !settings.excludeFileTypes.includes(extension)
        );
    });

    for (const file of filesToSync) {
        await uploadFile(file, drive); // Assume `drive` is initialized
    }
}