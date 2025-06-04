export interface PluginSettings {
    includeFileTypes: string[];
    excludeFileTypes: string[];
    syncInterval: number; // in milliseconds
}

export const DEFAULT_SETTINGS: PluginSettings = {
    includeFileTypes: ["md", "txt"],
    excludeFileTypes: ["tmp", "log"],
    syncInterval: 60000, // 1 minute
};