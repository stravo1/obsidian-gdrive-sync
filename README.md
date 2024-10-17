# Obsidian Google Drive Sync Plugin

![GitHub last commit](https://img.shields.io/github/last-commit/stravo1/obsidian-gdrive-sync)
![GitHub Release Date](https://img.shields.io/github/release-date/stravo1/obsidian-gdrive-sync)
![GitHub commit activity](https://img.shields.io/github/commit-activity/m/stravo1/obsidian-gdrive-sync)
[![Discord](https://img.shields.io/discord/1238748000344608788)](https://img.shields.io/discord/1238748000344608788?link=https%3A%2F%2Fdiscord.gg%2FdPasX4Ac2P)


## Overview

The Obsidian Google Drive Sync Plugin is a plugin that allows you to seamlessly sync your notes across devices with Google Drive. It is a free alternative to the paid [Obsidian Sync](https://obsidian.md/sync) service. With just a few simple steps, you can enable auto sync and enjoy the convenience of accessing your notes from any device, be it mobile or dekstop, always up-to-date!

This plugin is designed to be easy to install and configure compared to other plugins, no need to tackle git repos or manage Google Cloud Projects or setup any other external app.

> ⚠️ Versions older than [beta-17](https://github.com/stravo1/obsidian-gdrive-sync/releases/tag/v0.9.9-beta-17) are not entirely compatible with Obsidian v1.7 and newer.

> ⚠️ The plugin is under active development, new releases might introduce bugs, old releases maybe be incompatible with the new ones. This might lead to data loss. Do read the [FAQs](#faqs) before trying out the plugin. Please create a BACKUP of your vault before you install and try this plugin. The plug-in is not optimised for vault having more than 1k files, working on optimization for large vaults.

## Features

- **Simple Installation**: Although the plugin is not yet listed in the official [Obsidian Plugins List](https://obsidian.md/plugins), still it's relatively [easy to install](#installation).

- **User-Friendly Configuration**: Set up your Google Drive synchronization with just a few clicks. No complex setup required.

- **Automatic Sync**: Your notes will automatically sync to Google Drive while you edit them, ensuring that you have the latest version of your notes on all your devices.

- **Access Anywhere**: Access your notes from any device, be it mobile or desktop.

- **Secure and Reliable**: Your notes are securely stored on YOUR Google Drive, and the plugin does NOT store/collect any data whatsoever.

## Installation

To install the Obsidian Google Drive Auto Sync Plugin, follow these steps (if you have previoulsy installed any unofficial plugin the steps are identical):

1. Download the "obsidian-gdrive-sync.zip" from the [latest release](https://github.com/stravo1/obsidian-gdrive-sync/releases) and unzip it. After unzipping you should have a folder named "obsidian-gdrive-sync" containing 3 files. If after unzipping you end up with 3 different files (main.js, styles.css, manifest.json), place them under a new folder called "obsidian-gdrive-sync".

2. Navigate to your vault's location. Open the `.obsidian` folder (Turn on "Show Hidden Files and Folders" in your file manager if this folder is not visible). Go to `plugins` (You might have to create this folder if you never installed any plugin before). Paste the folder containing 3 files. The path to the plugin should look like this: `/$PATH_TO_VAULT/.obsidian/plugins/obsidian-gdrive-sync`

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

6. On other devices, create a vault with the same name, install the plug-in and log-in. The plug-in should detect that a vault with the same name as the current one has been synced and uploaded to Drive and should download all the files.

7. That's it! Enjoy auto sync :)

## FAQs
#### Q. Does this plgin work for Android/iOS?  
Yes it does! The entire purpose of this plugin is to make sure that you have access to your notes no matter where you are and what device you are using. So how to install the plugin on:  
Android: it's exactly how you would install it on your desktop: download the latest release zip, extract it, copy the folder to `.obsidian/plugins` under the location where you chose to create the vault. Here's a [video walkthrough](https://github.com/stravo1/obsidian-gdrive-sync/issues/4#issuecomment-2022138355).  
iOS: There's not a conventional way of installing these unofficial plugins on your iOS devices. The only option as of now is to create the vault, install the plugin and copy over the entire vault from desktop to the iOS device. If you have installed the plugin in an existing vault, you can copy over the vault as is. Here's some links: [Github comment](https://github.com/stravo1/obsidian-gdrive-sync/issues/12#issuecomment-2146264456) - [Reddit Thread](https://www.reddit.com/r/ObsidianMD/comments/p9evrs/manually_install_plugins_on_ios/)

#### Q. Does the vault need to have the same name across devices?  
A. Yes! The plug-in can be used to sync multiple vaults, and it uses the vault name to identify which vault is being currently worked on and need to be synced, you need to keep the vault name same across devices so that changes made under "sample-vault" on one device appears under "sample-vault" on your other devices as well. Once the vault has been initialized on one device you just need to create a vault with the same name on your other devices and install the plug-in on those devices and log-in. Everything would sync automatically after that.
  
#### Q. What's the `lastSync: ...` thing under properties/tags?  
The plugin keeps track of the last time the file was synced on a particular device using a "property" or YAML tag named `lastSync`. This keeps changing as the note is continuously synced. Please refrain from editing that tag. [Read more](https://github.com/stravo1/obsidian-gdrive-sync/issues/9#issuecomment-2026540794)

#### Q. Why does filenames in Google Drive have the entire path of the note and why is the folder structure not recreated in Drive? / Why does it name files like the folder structure instead of just creating the folders?
> TL;DR: It is not a bug, this is intended behaviour, having the folder structure in the filename directly is much simpler to work with in development compared to replicating folder structure in Drive as Obsidian has the capability to recreate folder structure from the filename.

The Obsidian API can directly provide and construct the folder structure with just the pathname, so while storing in Drive the files are uploaded with their entire path as their filename instaed of creating actual folders. This reduces the complexity of managing folders and subfolders in Drive as everything is in the root vault folder and the filenames of the notes have enough info to reconstruct the actual vault. Obsidian can create all the folders in between if it is told to create a file named "SampleFolder/SubFolder/Test.md". It might look messy in Drive but it is assumed that you are gonna spend most of the time on working in Obsidian and not worry about how the sync is implemented in the backend :)
  
#### ~Q. Why are my attachments being renamed?~ (SOLVED after [beta-13](https://github.com/stravo1/obsidian-gdrive-sync/releases/tag/v0.9.9-beta-13-fix-3))  
If you are using a release older then beta-13 then the plugin renames the attachment to keep track of it: the attachments are renamed when they are uploaded because unlike in notes there's no "lastSync" tag that the plug-in can read from the note's content, so to differentiate between which attachments are synced and which are not it's renamed to "attachment_name-synced". I am actively trying to create a workaround for this, but it will take time. After [beta-13](https://github.com/stravo1/obsidian-gdrive-sync/releases/tag/v0.9.9-beta-13-fix-3) this is no more the case (read release notes).

#### Q. Can I manually add files in Drive? / Does the plug-in track files manually added to the Drive folder? / Can I import files manually to the Drive folder?  
Unfortunately no, for security reasons the plug-in has access to only those files that _it creates_, and it has been made such that all vaults stay under the "obsidian" folder in Drive, and it can only access those files that it has created under that folder to make sure that it is not tampering/reading other sensitive files that the user might have. Here's some techincal details: `.../auth/drive.appdata` and `...auth/drive.file` are the scopes the plug-in has access to.

#### Q. What about security and privacy?  
The plug-in has limited access to only those files it creates itself, so it can't read any other files on your Drive. While giving the plug-in the necessary permissions you can confirm it yourself. And as for the token exchange part a server has to be unfortunately involved. I have a server hosted (whose link is the LogIn link) which does the code exchange for you, you can however implement your own Google Cloud Project and retrieve the refresh token. The plug-in just requires the refresh token to work, how it is retrieved is none of it's concern. More info at https://github.com/stravo1/obsidian-gdrive-sync/issues/24

#### Q. Notes created from templates get deleted automatically. How to solve it?  
The plug-in uses the "lastSync" tag to keep track of synced files. So if a new note having the "lastSync" tag of the template from which it was created is detected by the plug-in it assumes that this "new" note was already synced as it has the "lastSync" tag (which is not true as it got the tag from the template) and as it can't find this "new" note on Drive (of cource it can't, it was never uploaded) it deletes the note to keep it in sync with Drive. Solution is to add the name of the template note/folder containing templates under the Blacklist option in settings and remove the "lastSync" tag from the template note(s) if it(they) has(have) the tag. 

#### Q. Files got deleted accidentally or due to plugin errors, what to do?  
Do not panic, all files deleted by the plugin goes to the .trash folder in your vault folder in your desktop or mobile devices. You can get them from there. However for restoring them to the vault, do the following: disable this plugin, restore the required notes from .trash folder, remove the lastSync tag from the notes, enable plugin again. Not doing this will keep deleting the notes which were restored with the lastSync tag intact.
  
#### Q. Why is this plugin not on the official Obsidian Plugin List?  
A. It is very much in beta and not ready for "public" release, and will require a lot of testing and changes before it can be listed on the official plugins' list. there's a genuine risk of data loss (although i have tried my best to cover all edge cases but can't risk other people's data solely on my coding skills 😅). tldr: personally i don't want an unfinished plug-in with risk of data loss being listed as "official" :)

## Troubleshooting & Support

If you encounter any issues with the plugin, check the following:

- Ensure that the plugin has been properly installed.
- Ensure that the refresh token has been properly copied and pasted.
- Ensure you have a good internet connection.
- Check for any error messages in the Obsidian console and report the same by [creating an issue on GitHub](https://github.com/stravo1/obsidian-gdrive-sync/issues).
- Attach Error Logs and Verbose Logs while creating an issue. You can enable logging in settings.


If you need assistance or have questions, feel free to reach out by [creating an issue on GitHub](https://github.com/stravo1/obsidian-gdrive-sync/issues) or you can also [join the discord server](https://discord.com/invite/dPasX4Ac2P).

## Feedback and Contributions

If you have suggestions, encounter issues, or want to contribute to its development, please visit our [GitHub repository](https://github.com/stravo1/obsidian-gdrive-sync) and create an issue or pull request or you can also [join the discord server](https://discord.com/invite/dPasX4Ac2P).

## Star History

<a href="https://star-history.com/#stravo1/obsidian-gdrive-sync&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=stravo1/obsidian-gdrive-sync&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=stravo1/obsidian-gdrive-sync&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=stravo1/obsidian-gdrive-sync&type=Date" />
 </picture>
</a>

---

Happy syncing!
