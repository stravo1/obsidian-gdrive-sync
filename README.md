# Obsidian Google Drive Auto Sync Plugin

## Overview

The Obsidian Google Drive Sync Plugin is a plugin that allows you to seamlessly sync your notes across devices with Google Drive. It is a free alternative to the paid [Obsidian Sync](https://obsidian.md/sync) service. With just a few simple steps, you can enable auto sync and enjoy the convenience of accessing your notes from any device, be it mobile or dekstop, always up-to-date!

This plugin is designed to be easy to install and configure compared to other plugins, no need to tackle git repos or manage Google Cloud Projects or setup any other external app.

## Features

- **Simple Installation**: Although the plugin is not yet listed in the official [Obsidian Plugins List](https://obsidian.md/plugins), still it's relatively [easy to install](#installation).

- **User-Friendly Configuration**: Set up your Google Drive synchronization with just a few clicks. No complex setup required.

- **Automatic Sync**: Your notes will automatically sync to Google Drive while you edit them, ensuring that you have the latest version of your notes on all your devices.

- **Access Anywhere**: Access your notes from any device, be it mobile or desktop.

- **Secure and Reliable**: Your notes are securely stored on YOUR Google Drive, and the plugin does NOT store/collect any data whatsoever.

## Installation

To install the Obsidian Google Drive Auto Sync Plugin, follow these steps (if you have previoulsy installed any unofficial plugin the steps are identical):

1. Download the "obsidian-gdrive-sync.zip" from the [latest release](https://github.com/stravo1/obsidian-gdrive-sync/releases) and unzip it. After unzipping you should have a folder named "obsidian-gdrive-sync" containing 3 files. If after unzipping you end up with 3 different files (main.js, styles.css, manifest.json), place them under a new folder called "obsidian-gdrive-sync".

2. Navigate to your vault's location. Open the `.obsidian` folder (Turn on "Show Hidden Files and Folders" in your file manager if this folder is not visible). Go to `plugins` (You might have to create this folder if you never installed any plugin before). Paste the folder containing 3 files. The pah to the plugin should look like this: `/$PATH_TO_VAULT/.obsidian/plugins/obsidian-gdrive-sync`

3. Open the required vault in Obsidian. Enable **Community Plugins** under Settings (If you are opening the vault for the first time you might be asked to confirm to "Trust Author and Enable Plugin", click to enable it). 

4. Enable the **Google Drive Sync** plugin under **Installed Plugins**. Wait for a few seconds. Make sure to have a good internet connection.

5. Click on the **Google Drive Sync** settings under **Community Plugins** section that becomes visible.

## Configuration

Configuring the plugin is straightforward:

1. Under the plugin settings you will be provided with a link to Login. Clicking the link will open a new browser window.

2. Choose the Google account whose Drive space will be used. Provide access to all the permissions (`See, edit, create, and delete only the specific Google Drive files you use with this app`).

3. You will be provided with a code/token (`Refresh Token`). Copy the code and paste it in the space provided (Set Refresh Token) under the plugin settings and click on Checkmark button. As prompted, reload the plugin by turing it on and off under Communtiy Plugins.

4. If you are using this plugin for the first time with a vault, you will be prompted to **Initialize vault**. This creates a folder with the same name as your vault in your Google Drive and copies all the files into it. You might need to reload the plugin again once initialization is complete.

5. Once the previous steps are complete, set your preferred synchronization interval.

6. Enjoy auto sync, for free!

## Troubleshooting & Support

If you encounter any issues with the plugin, check the following:

- Ensure that the plugin has been properly installed.

- Ensure that the refresh token has been properly copied and pasted.

- Ensure you have a good internet connection.

- Check for any error messages in the Obsidian console and report the same by [creating an issue on GitHub](https://github.com/stravo1/obsidian-gdrive-sync/issues).


If you need assistance or have questions, feel free to reach out to us by [creating an issue on GitHub](https://github.com/stravo1/obsidian-gdrive-sync/issues).

## Feedback and Contributions

I welcome any feedback and contributions to improve this plugin. If you have suggestions, encounter issues, or want to contribute to its development, please visit our [GitHub repository](https://github.com/stravo1/obsidian-google-drive-sync) and create an issue or pull request.

---

Happy syncing! Enjoy the simplicity and convenience of auto-syncing your Obsidian notes with Google Drive using this plugin. I hope it enhances your Obsidian experience and simplifies your note-taking journey :)