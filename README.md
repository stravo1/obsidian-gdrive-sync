# Obsidian Google Drive Sync Plugin

## Overview

The Obsidian Google Drive Sync Plugin is a plugin that allows you to seamlessly sync your notes across devices with Google Drive. It is a free alternative to the paid [Obsidian Sync](https://obsidian.md/sync) service. With just a few simple steps, you can enable auto sync and enjoy the convenience of accessing your notes from any device, be it mobile or dekstop, always up-to-date!

This plugin is designed to be easy to install and configure compared to other plugins, no need to tackle git repos or manage Google Cloud Projects or setup any other external app.

> ⚠️ The plugin is under active development, new releases might introduce bugs, old releases maybe be incompatible with the new ones. This might lead to data loss. Some workarounds (like [this](#q-why-are-my-attachments-being-renamed)) being used might create more problems. So please create a BACKUP of your vault before you install and try this plugin.

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

## FAQs
#### Q. Does this plgin work for Android/iOS?  
Yes it does! The entire purpose of this plugin is to make sure that you have access to your notes no matter where you are and what device you are using. So how to install the plugin on:  
Android: it's exactly how you would install it on your desktop: download the latest release zip, extract it, copy the folder to `.obsidian/plugins` under the location where you chose to create the vault. Here's a [video walkthrough](https://github.com/stravo1/obsidian-gdrive-sync/issues/4#issuecomment-2022138355).  
iOS: There's not a conventional way of installing these unofficial plugins on your iOS devices. The only option as of now is to create the vault, install the plugin and copy over the entire vault from desktop to the iOS device. If you have installed the plugin in an existing vault, you can copy over the vault as is. Here's some links: [Github comment](https://github.com/stravo1/obsidian-gdrive-sync/issues/12#issuecomment-2028541154) - [Reddit Thread](https://www.reddit.com/r/ObsidianMD/comments/p9evrs/manually_install_plugins_on_ios/)
  
#### Q. What's the `lastSync: ...` thing under properties/tags?  
The plugin keeps track of the last time the file was synced on a particular device using a "property" or YAML tag named `lastSync`. This keeps changing as the note is continuously synced. Please refrain from editing that tag. [Read more](https://github.com/stravo1/obsidian-gdrive-sync/issues/9#issuecomment-2026540794)
  
#### Q. Why are my attachments being renamed?  
The attachments are renamed when they are uploaded because unlike in notes there's no "lastSync" tag that the plug-in can read from the note's content, so to differentiate between which attachments are synced and which are not it's renamed to "attachment_name-synced". I am actively trying to create a workaround for this, but it will take time.  
  
#### Q. Does the vault need to have the same name across devices?  
A. Yes! The plug-in can be used to sync multiple vaults, and it uses the vault name to identify which vault is being currently worked on and need to be synced, you need to keep the vault name same across devices so that changes made under "sample-vault" on one device appears under "sample-vault" on your other devices as well.  
  
#### Q. Why is this plugin not on the official Obsidian Plugin List?  
A. It is very much in beta and not ready for "public" release, and will require a lot of testing and changes before it can be listed on the official plugins' list. there's a genuine risk of data loss (although i have tried my best to cover all edge cases but can't risk other people's data solely on my coding skills 😅). tldr: personally i don't want an unfinished plug-in with risk of data loss being listed as "official" :)

## Troubleshooting & Support

If you encounter any issues with the plugin, check the following:

- Ensure that the plugin has been properly installed.

- Ensure that the refresh token has been properly copied and pasted.

- Ensure you have a good internet connection.

- Check for any error messages in the Obsidian console and report the same by [creating an issue on GitHub](https://github.com/stravo1/obsidian-gdrive-sync/issues).


If you need assistance or have questions, feel free to reach out by [creating an issue on GitHub](https://github.com/stravo1/obsidian-gdrive-sync/issues) or you can also [join the discord server](https://discord.com/invite/dPasX4Ac2P).

## Feedback and Contributions

If you have suggestions, encounter issues, or want to contribute to its development, please visit our [GitHub repository](https://github.com/stravo1/obsidian-gdrive-sync) and create an issue or pull request or you can also [join the discord server](https://discord.com/invite/dPasX4Ac2P).

---

Happy syncing!
