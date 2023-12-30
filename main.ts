import {
	App,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	setIcon,
	Setting,
	TFile,
} from "obsidian";

import axios from "axios";
import ShortUniqueId from "short-unique-id";
import {
	deleteFile,
	getFile,
	getFileInfo,
	getFilesList,
	getFoldersList,
	getVaultId,
	modifyFile,
	renameFile,
	uploadFile,
	uploadFolder,
} from "./actions";

/* helper functions */
function objectToMap(obj: Record<string, string>) {
	const map: Map<string, string> = new Map();
	for (const key in obj) {
		if (obj.hasOwnProperty(key)) {
			map.set(key, obj[key]);
		}
	}
	return map;
}

function mapToObject(map: Map<string, string>) {
	let obj: Record<string, string> = {};
	for (const [key, value] of map.entries()) {
		obj[key] = value;
	}
	return obj;
}

const getAccessToken = async (
	refreshToken: string,
	showError: boolean = false
) => {
	var response;
	await axios
		.post(
			"https://red-formula-303406.ue.r.appspot.com/auth/obsidian/refresh-token",
			{
				refreshToken,
			}
		)
		.then((res) => {
			response = res.data;
		})
		.catch((err) => {
			if ((err.code = "ERR_NETWORK") && showError) {
				new Notice("Oops! Network error :(");
				new Notice("Or maybe no refresh token provided?", 5000);
			}

			response = "error";
		});
	return response;
};

const { randomUUID } = new ShortUniqueId({ length: 6 });

interface driveValues {
	refreshToken: string;
	accessToken: string;
	validToken: Boolean;
	vaultId: any;
	vaultInit: boolean;
	filesList: any[];
	rootFolderId: any;
	refresh: boolean;
	refreshTime: string;
	autoRefreshBinaryFiles: string;
	//writingFile: boolean;
	//syncQueue: boolean;
}

const DEFAULT_SETTINGS: driveValues = {
	refreshToken: "",
	accessToken: "",
	validToken: false,
	vaultId: "",
	filesList: [],
	vaultInit: false,
	rootFolderId: "",
	refresh: false,
	refreshTime: "5",
	autoRefreshBinaryFiles: "0",
	//writingFile: false,
	//syncQueue: false,
};

const metaPattern = /^---\n[\s\S]*---/;
const driveDataPattern = /\nlastSync:.*\n/;

interface pendingSyncItemInterface {
	fileID?: string;
	action: "UPLOAD" | "MODIFY" | "RENAME" | "DELETE";
	timeStamp: string;
	newFileName?: string;
	isBinaryFile?: boolean;
}

export default class driveSyncPlugin extends Plugin {
	settings: driveValues;
	cloudFiles: string[] = [];
	localFiles: string[] = [];
	timer: any = null;
	alreadyRefreshing: boolean = false;
	writingFile: boolean = false;
	syncQueue: boolean = false;
	currentlyUploading: string | null = null; // to mitigate the issue of deleting recently created file while its being uploaded and gets overlaped with the auto-trash function call
	renamingList: string[] = [];
	deletingList: string[] = [];
	statusBarItem = this.addStatusBarItem().createEl("span", "sync_icon_still");
	pendingSync: boolean = false;
	connectedToInternet: boolean = true;
	pendingSyncItems: Array<pendingSyncItemInterface> = [];
	renamedWhileOffline: Map<string, string> = new Map();
	finalNamesForFileID: Map<string, string> = new Map();
	completingPendingSync: boolean = false;

	completeAllPendingSyncs = async () => {
		/* files created when offline are assigned a dummy fileId 
		so the following Map keeps track of the dummy fielId to the actual fileId 
		which is retrieved when the file is uploadedf for the first time when online */
		let uuidToFileIdMap = new Map();

		let pendingSyncFile = this.app.vault.getAbstractFileByPath(
			"pendingSync-gdrive-plugin"
		);

		pendingSyncFile instanceof TFile
			? console.log(
					JSON.parse(await this.app.vault.read(pendingSyncFile))
			  )
			: console.log("No file");

		let {
			pendingSyncItems,
			finalNamesForFileID,
		}: {
			pendingSyncItems: Array<pendingSyncItemInterface>;
			finalNamesForFileID: Record<string, string>;
		} =
			pendingSyncFile instanceof TFile
				? JSON.parse(await this.app.vault.read(pendingSyncFile))
				: { pendingSyncItems: [], finalNamesForFileID: new Map() };

		this.pendingSyncItems = [...pendingSyncItems];
		this.finalNamesForFileID = objectToMap(finalNamesForFileID);

		let finalNamesForFileIDMap = objectToMap(finalNamesForFileID);

		console.log(pendingSyncItems, finalNamesForFileID);

		if (pendingSyncItems.length) {
			new Notice(
				"ATTENTION: Syncing all pending changes since app was last online!"
			);
			new Notice(
				"Please wait till the sync is complete before proceeding with anything else..."
			);
		}
		this.settings.filesList = await getFilesList(
			this.settings.accessToken,
			this.settings.vaultId
		); // to get the last modifiedTimes
		try {
			this.completingPendingSync = true;
			for (var item of pendingSyncItems) {
				let lastCloudUpdateTime = new Date(0);
				let pendingSyncTime = new Date(item.timeStamp);
				this.settings.filesList.forEach((file) => {
					if (file.id == item.fileID) {
						lastCloudUpdateTime = new Date(file.modifiedTime!);
					}
				});
				switch (item.action) {
					case "DELETE":
						if (lastCloudUpdateTime < pendingSyncTime) {
							await deleteFile(
								this.settings.accessToken,
								uuidToFileIdMap.get(item.fileID)
									? uuidToFileIdMap.get(item.fileID)
									: item.fileID
							);
						}
						break;
					case "UPLOAD":
						var fileName = finalNamesForFileIDMap.get(item.fileID!);
						var file = this.app.vault.getAbstractFileByPath(
							fileName!
						);
						let actualId;
						if (file instanceof TFile) {
							if (item.isBinaryFile) {
								actualId = await this.uploadNewAttachment(file);
							} else {
								actualId = await this.uploadNewNotesFile(file);
							}
						}
						uuidToFileIdMap.set(item.fileID, actualId);
						finalNamesForFileIDMap.set(actualId, fileName!);
						this.finalNamesForFileID.set(actualId, fileName!);
						break;
					case "MODIFY":
						if (pendingSyncTime > lastCloudUpdateTime) {
							let file = this.app.vault.getAbstractFileByPath(
								finalNamesForFileIDMap.get(item.fileID!)!
							);
							if (file instanceof TFile) {
								await this.updateLastSyncMetaTag(file);
								var buffer = await this.app.vault.readBinary(
									file
								);
								await modifyFile(
									this.settings.accessToken,
									uuidToFileIdMap.get(item.fileID)
										? uuidToFileIdMap.get(item.fileID)
										: item.fileID,
									buffer
								);
							}
						}
						break;
					case "RENAME":
						if (pendingSyncTime > lastCloudUpdateTime) {
							await renameFile(
								this.settings.accessToken,
								uuidToFileIdMap.get(item.fileID)
									? uuidToFileIdMap.get(item.fileID)
									: item.fileID,
								finalNamesForFileIDMap.get(item.fileID!)
							);
						}
						break;
				}
				this.pendingSyncItems.shift();
				await this.writeToPendingSyncFile();
				new Notice(
					`Synced ${pendingSyncItems.indexOf(item) + 1}/${
						pendingSyncItems.length
					} changes`
				);
			}
		} catch (err) {
			this.completingPendingSync = false;
			this.notifyError();
			this.checkForConnectivity();
		}
		if (pendingSyncItems.length) {
			new Notice("Sync complete!");
			this.finalNamesForFileID.clear();
			await this.writeToPendingSyncFile();
		}
		this.completingPendingSync = false;
		this.pendingSync = false;
		this.refreshAll();
	};

	checkForConnectivity = async () => {
		try {
			await fetch("https://www.github.com/stravo1", {
				mode: "no-cors",
			});

			if (!this.connectedToInternet) {
				new Notice("Connectivity re-established!");
				this.connectedToInternet = true;
				this.completeAllPendingSyncs();
			}
		} catch (err) {
			console.log("Checking for connectivity again after 5sec...");
			if (this.connectedToInternet) {
				console.log("error: " + err); // (currently fetch failed)
				new Notice("Connection lost :(");
				this.connectedToInternet = false;
			}
			setTimeout(() => {
				this.checkForConnectivity();
			}, 5000);
		}
	};

	notifyError = () => {
		if (!this.pendingSync) {
			this.pendingSync = true;
			new Notice("ERROR: Something went wrong! Sync is paused.");
		}
	};

	cleanInstall = async () => {
		try {
			new Notice("Creating vault in Google Drive...");
			var res = await uploadFolder(
				this.settings.accessToken,
				this.app.vault.getName(),
				this.settings.rootFolderId
			);
			this.settings.vaultId = res;
			new Notice("Vault created!");
			new Notice(
				"Uploading files, this might take time. Please wait...",
				6000
			);
			var filesList = this.app.vault.getFiles();
			for (const file of filesList) {
				const buffer: any = await this.app.vault.readBinary(file);
				await uploadFile(
					this.settings.accessToken,
					file.path,
					buffer,
					this.settings.vaultId
				);
			}
			new Notice("Files uploaded!");
			new Notice("Please reload the plug-in.", 5000);
		} catch (err) {
			new Notice("ERROR: Unable to initialize Vault in Google Drive");
			this.checkForConnectivity();
		}
	};

	refreshAll = async () => {
		try {
			if (!this.connectedToInternet) {
				console.log("ERROR: Connectivity lost, not refreshing...");
				return;
			}
			if (this.pendingSync) {
				console.log("PAUSED: Writing pending syncs, not refreshing...");
				return;
			}
			if (this.alreadyRefreshing) {
				return;
			} else {
				this.alreadyRefreshing = true;
			}
			this.refreshFilesListInDriveAndStoreInSettings();
			/* refresh both the files list */
			this.cloudFiles = [];
			this.localFiles = [];

			this.settings.filesList.map((file) =>
				this.cloudFiles.push(file.name)
			);
			this.app.vault
				.getFiles()
				.map((file) => this.localFiles.push(file.path));

			var toDownload = this.cloudFiles.filter(
				(file) =>
					!this.localFiles.includes(file) && // is not currently in vault
					!this.renamingList.includes(file) && // is not currently being renamed
					!this.deletingList.includes(file) // is not currently being deleted
			);

			/* delete tracked but not-in-drive-anymore files */
			this.app.vault.getFiles().map(async (file) => {
				if (
					!this.cloudFiles.includes(file.path) &&
					!this.renamingList.includes(file.path) &&
					file.path != this.currentlyUploading
				) {
					if (file.extension != "md") {
						if (/-synced\.*/.test(file.path)) {
							this.app.vault.delete(file);
							return;
						}
					}
					var content = await this.app.vault.read(file);
					if (driveDataPattern.test(content)) {
						this.app.vault.delete(file);
					}
				}
			});

			/* download new files or files that were renamed */
			if (toDownload.length) {
				new Notice("Downloading missing files", 2500);

				this.settings.refresh = true;
				for (const dFile of toDownload) {
					var id;
					this.settings.filesList.map((file: any) => {
						//console.log(file.name);

						if (file.name == dFile) {
							id = file.id;
						}
					});
					//console.log(id, dFile);

					var file = await getFile(this.settings.accessToken, id);
					await this.app.vault
						.createBinary(file[0], file[1])
						.catch(async () => {
							var path = file[0]
								.split("/")
								.slice(0, -1)
								.join("/");
							//console.log(path);

							await this.app.vault.createFolder(path);
							await this.app.vault.createBinary(file[0], file[1]);
						});
					new Notice(
						`Downloaded ${toDownload.indexOf(dFile) + 1}/${
							toDownload.length
						} files`,
						1000
					);
				}
				new Notice("Download complete :)", 2500);
				// new Notice(
				// 	"Sorry to make you wait for so long. Please continue with your work",
				// 	5000
				// );
				this.settings.refresh = false;
			}
			this.getLatestContent(this.app.workspace.getActiveFile()!);
			this.alreadyRefreshing = false;
			//console.log("refreshing filelist...");
		} catch (err) {
			this.notifyError();
			this.checkForConnectivity();
			this.alreadyRefreshing = false;
		}
	};
	uploadNewNotesFile = async (newFile: TFile) => {
		try {
			if (!this.connectedToInternet) {
				console.log("ERROR: Connectivity lost, not uploading...");
				return;
			}
			if (
				newFile.extension != "md" ||
				newFile.path == this.currentlyUploading
			)
				return; // skip binary files or the file which is already being uploaded
			this.writingFile = true;
			this.currentlyUploading = newFile.path;

			new Notice("Uploading new file to Google Drive!");

			var content = await this.app.vault.read(newFile);

			var metaExists = metaPattern.test(content);
			var driveDataExists = driveDataPattern.test(content);
			if (!metaExists) {
				await this.app.vault.modify(
					newFile,
					`---\nlastSync: ${new Date().toString()}\n---\n` + content
				);
			} else if (!driveDataExists) {
				await this.app.vault.modify(
					newFile,
					content.replace(
						/^---\n/g,
						`---\nlastSync: ${new Date().toString()}\n`
					)
				);
			}

			var buffer: any = await this.app.vault.readBinary(newFile);
			var id = await uploadFile(
				this.settings.accessToken,
				newFile.path,
				buffer,
				this.settings.vaultId
			);

			this.writingFile = false;
			this.cloudFiles.push(newFile.path);
			this.refreshFilesListInDriveAndStoreInSettings();
			this.currentlyUploading = null;

			new Notice("Uploaded!");
			return id;
		} catch (err) {
			this.notifyError();
			this.checkForConnectivity();
			this.writingFile = false;
			this.currentlyUploading = null;
		}
	};

	getLatestContent = async (
		file: TFile,
		forced: "forced" | false = false
	) => {
		try {
			if (!this.connectedToInternet) {
				console.log(
					"ERROR: Connectivity lost, not fetching latest content..."
				);
				return;
			}
			if (this.cloudFiles.includes(file?.path!) && !this.syncQueue) {
				var index = this.cloudFiles.indexOf(file?.path!);

				var cloudDate = new Date(
					this.settings.filesList[index].modifiedTime
				);
				var content: string;
				var timeStamp: any;
				var isBinaryFile: boolean = false;

				if (file.extension != "md") {
					isBinaryFile = true;
				} else {
					content = await this.app.vault.read(file!);
					timeStamp = content.match(/lastSync:.*/);
				}

				//console.log(cloudDate, new Date(timeStamp![0]));

				if (
					forced == "forced" ||
					(isBinaryFile &&
						parseInt(this.settings.autoRefreshBinaryFiles)) ||
					(timeStamp /* check if timeStamp is present */ &&
						cloudDate.getTime() >
							new Date(timeStamp![0]).getTime() +
								3000) /* allow 3sec delay in 'localDate' */
				) {
					// new Notice("Downloading updated file!");
					var id;
					this.settings.filesList.map((fileItem: any) => {
						if (fileItem.name == file.path) {
							id = fileItem.id;
						}
					});
					var res = await getFile(this.settings.accessToken, id);
					if (this.syncQueue && !isBinaryFile) return;
					//console.log(this.syncQueue);

					await this.app.vault
						.modifyBinary(file, res[1])
						.catch(async () => {
							var path = res[0].split("/").slice(0, -1).join("/");
							//console.log(path);

							await this.app.vault.createFolder(path);
							await this.app.vault.modifyBinary(res[0], res[1]);
						});
					// new Notice("Sync complete :)");
				}
			}
		} catch (err) {
			this.notifyError();
			this.checkForConnectivity();
		}
	};

	uploadNewAttachment = async (e: TFile) => {
		new Notice("Uploading new attachment!");
		var buffer: any = await this.app.vault.readBinary(e);
		const fileExtensionPattern = /\..*/;
		var newFileName = e.path.replace(
			fileExtensionPattern,
			"-synced" + e.path.match(fileExtensionPattern)![0]
		);

		this.currentlyUploading = newFileName;

		await this.app.vault.rename(e, newFileName);

		this.cloudFiles.push(newFileName);
		let id = await uploadFile(
			this.settings.accessToken,
			newFileName,
			buffer,
			this.settings.vaultId
		);

		this.currentlyUploading = null;
		new Notice("Uploaded!");
		new Notice(
			"Please make sure that all links to this attachment are updated with the new name: " +
				newFileName.match(/\/.*-synced\..*$/)![0].slice(1),
			5000
		);
		return id;
	};

	updateLastSyncMetaTag = async (e: TFile) => {
		var content = await this.app.vault.read(e);

		var metaExists = metaPattern.test(content);
		var driveDataExists = driveDataPattern.test(content);

		if (metaExists) {
			if (driveDataExists) {
				this.app.vault.modify(
					e,
					content.replace(
						driveDataPattern,
						`\nlastSync: ${new Date().toString()}\n`
					)
				);
			} else {
				this.app.vault.modify(
					e,
					content.replace(
						/^---\n/g,
						`---\nlastSync: ${new Date().toString()}\n`
					)
				);
			}
		} else {
			this.app.vault.modify(
				e,
				`---\nlastSync: ${new Date().toString()}\n---\n` + content
			);
		}
	};

	writeToPendingSyncFile = async () => {
		let pendingSyncFile = this.app.vault.getAbstractFileByPath(
			"pendingSync-gdrive-plugin"
		);
		// console.log(
		// 	this.pendingSyncItems,
		// 	this.finalNamesForFileID,
		// 	JSON.stringify({
		// 		pendingSyncItems: this.pendingSyncItems,
		// 		finalNamesForFileID: mapToObject(this.finalNamesForFileID),
		// 	})
		// );

		if (pendingSyncFile instanceof TFile) {
			await this.app.vault.modify(
				pendingSyncFile,
				JSON.stringify({
					pendingSyncItems: this.pendingSyncItems,
					finalNamesForFileID: mapToObject(this.finalNamesForFileID),
				})
			);
		} else {
			await this.app.vault.create(
				"pendingSync-gdrive-plugin",
				JSON.stringify({
					pendingSyncItems: this.pendingSyncItems,
					finalNamesForFileID: mapToObject(this.finalNamesForFileID),
				})
			);
		}
	};
	refreshFilesListInDriveAndStoreInSettings = async () => {
		/*
		fetches all the files that are backed-up in drive and
		stores them in data.json file which contains all the settings,
		this list can be used to get the last known list of files on drive
		in case of offline operations when even the initial fetch request
		for retreiving the files list also fails
		*/
		this.settings.filesList = await getFilesList(
			this.settings.accessToken,
			this.settings.vaultId
		);
		this.saveSettings();
	};

	async onload() {
		await this.loadSettings();

		var res: any = await getAccessToken(this.settings.refreshToken, true); // get accessToken
		var count = 0;
		while (res == "error") {
			console.log("Trying to get accessToken again after 5secs...");
			let resolvePromise: Function;
			let promise = new Promise((resolve, reject) => {
				resolvePromise = resolve;
			});
			setTimeout(() => {
				resolvePromise();
			}, 5000);
			await promise;
			res = await getAccessToken(this.settings.refreshToken);
			count++;
			if (count == 6) {
				this.settings.accessToken = "";
				this.settings.validToken = false;
				new Notice(
					"FATAL ERROR: Connection timeout, couldn't fetch accessToken :("
				);
				new Notice(
					"Check your internet connection and restart the plugin..."
				);
				this.connectedToInternet = false;

				/* use previously fetched fileList (can't beleive this is actually becoming useful) */
				this.settings.filesList.map((file) =>
					this.cloudFiles.push(file.name)
				);
				this.app.vault
					.getFiles()
					.map((file) => this.localFiles.push(file.path));

				let pendingSyncFile = this.app.vault.getAbstractFileByPath(
					"pendingSync-gdrive-plugin"
				);
				var previousPendingSyncItems: Array<pendingSyncItemInterface> =
					pendingSyncFile instanceof TFile
						? JSON.parse(await this.app.vault.read(pendingSyncFile))
						: {};
				this.pendingSyncItems = [...previousPendingSyncItems];
				break;
			}
		}

		if (res != "error") {
			// if accessToken is available
			this.settings.accessToken = res.access_token;
			this.settings.validToken = true;
			var folders = await getFoldersList(this.settings.accessToken); // look for obsidian folder
			var reqFolder = folders.filter(
				(folder: any) => folder.name == "obsidian"
			);
			if (reqFolder.length) {
				this.settings.rootFolderId = reqFolder[0].id; // set the rootFolder or obsidian folder id
			} else {
				new Notice("Initializing required files"); // else create the folder
				this.settings.rootFolderId = await uploadFolder(
					this.settings.accessToken,
					"obsidian"
				);
			}
		}
		// else {
		// 	// accessToken is not available
		// 	this.settings.accessToken = "";
		// 	this.settings.validToken = false;
		// }
		if (this.settings.validToken) {
			try {
				this.settings.vaultId = await getVaultId(
					// get vaultId for the current fold
					this.settings.accessToken,
					this.app.vault.getName(),
					this.settings.rootFolderId
				);
			} catch (err) {
				new Notice(
					"FATAL ERROR: Couldn't get VaultID from Google Drive :("
				);
				new Notice("Check internet connection and restart plugin.");
				return;
			}
			if (this.settings.vaultId == "NOT FOUND") {
				// if vault doesn't exist
				this.settings.vaultInit = false;
				new Notice(
					`Oops! No vaults named ${this.app.vault.getName()} found in Google Drive`
				);
				new Notice(
					"Try initializing vault in Google Drive from plug-in settings :)",
					5000
				);
			} else {
				// if vault exists
				this.settings.vaultInit = true;
				await this.completeAllPendingSyncs();
				this.refreshAll();
				this.registerInterval(
					window.setInterval(async () => {
						this.refreshAll();
					}, parseInt(this.settings.refreshTime) * 1000)
				);
			}
		}

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new syncSettings(this.app, this));
		if (!this.settings.vaultInit) return;

		/* extract new files to be down/uploaded */
		this.settings.filesList.map((file) => this.cloudFiles.push(file.name));
		this.app.vault
			.getFiles()
			.map((file) => this.localFiles.push(file.path));

		//console.log(toUpload, toDownload);

		this.registerEvent(
			this.app.vault.on("rename", async (newFile, oldpath) => {
				if (newFile.path == "pendingSync-gdrive-plugin") {
					return;
				}
				if (this.completingPendingSync) {
					return;
				}
				try {
					if (!this.connectedToInternet) {
						console.log(
							"ERROR: Connectivity lost, not renaming files to Google Drive..."
						);
						if (!this.cloudFiles.length) {
							console.log(
								"FATAL ERROR: Nothing in cloudFiles...."
							);
							return;
						}
						if (
							!this.cloudFiles.includes(oldpath) &&
							!this.renamedWhileOffline.get(oldpath)
						) {
							if (newFile instanceof TFile) {
								let id = randomUUID();
								this.pendingSyncItems.push({
									newFileName: newFile.path,
									action: "UPLOAD",
									fileID: id,
									timeStamp: new Date().toString(),
								});
								this.renamedWhileOffline.set(newFile.path, id);
								this.finalNamesForFileID.set(id, newFile.path);
							}
						} else {
							let idIfWasAlreadyRenamedOffline =
								this.renamedWhileOffline.get(oldpath);
							let id: string;
							if (idIfWasAlreadyRenamedOffline) {
								id = idIfWasAlreadyRenamedOffline;
							} else {
								// this should change to proper id, if not then error
								this.settings.filesList.map((file, index) => {
									if (file.name == oldpath) {
										id = file.id;
									}
								});
							}
							this.pendingSyncItems.push({
								fileID: id!,
								action: "RENAME",
								timeStamp: new Date().toString(),
							});
							this.renamedWhileOffline.set(newFile.path, id!);
							this.renamedWhileOffline.delete(oldpath);
							this.finalNamesForFileID.set(id!, newFile.path);
						}
						await this.writeToPendingSyncFile();
						return;
					}
					/* this is for newly created files
					as the newly created file is always renamed first
					so it checks that whether the file was already in cloudFiles:
					if it was there we do normal renaming else we upload the new file
					*/
					if (!this.cloudFiles.includes(oldpath)) {
						if (newFile instanceof TFile) {
							this.uploadNewNotesFile(newFile);
						}
						return;
					}

					/* actual renaming of file */
					var id;
					var reqFile = ""; // required for changing the name of the file in the cloudsFile list
					this.settings.filesList.map((file, index) => {
						if (file.name == oldpath) {
							id = file.id;
							reqFile = file.name;
						}
					});
					this.renamingList.push(oldpath);

					this.cloudFiles[this.cloudFiles.indexOf(reqFile)] =
						newFile.path; // update the renamed file in cloudfiles
					await renameFile(
						this.settings.accessToken,
						id,
						newFile.path
					);
					new Notice("Files/Folders renamed!");

					this.renamingList.splice(
						this.renamingList.indexOf(oldpath),
						1
					);

					this.refreshFilesListInDriveAndStoreInSettings()
				} catch (err) {
					this.notifyError();
					this.checkForConnectivity();
					this.renamingList = [];
				}
			})
		);
		this.registerEvent(
			this.app.vault.on("create", async (e) => {
				if (e.path == "pendingSync-gdrive-plugin") {
					return;
				}
				if (this.completingPendingSync) {
					return;
				}
				try {
					if (!this.connectedToInternet) {
						console.log(
							"ERROR: Connectivity lost, not uploading files to Google Drive..."
						);
						if (e instanceof TFile && !/-synced\.*/.test(e.path)) {
							if (e.extension != "md") {
								let id = randomUUID();
								this.pendingSyncItems.push({
									action: "UPLOAD",
									timeStamp: new Date().toString(),
									newFileName: e.path,
									isBinaryFile: true,
									fileID: id,
								});
								this.renamedWhileOffline.set(e.path, id);
								this.finalNamesForFileID.set(id, e.path);
							}
						}
						await this.writeToPendingSyncFile();
						return;
					}

					if (e instanceof TFile && !/-synced\.*/.test(e.path)) {
						if (e.extension != "md") {
							await this.uploadNewAttachment(e);
						}
					}
				} catch (err) {
					this.notifyError();
					this.checkForConnectivity();
					this.currentlyUploading = null;
				}
			})
		);
		this.registerEvent(
			this.app.vault.on("delete", async (e) => {
				if (e.path == "pendingSync-gdrive-plugin") {
					return;
				}
				if (this.completingPendingSync) {
					return;
				}

				try {
					if (!this.connectedToInternet) {
						console.log(
							"ERROR: Connectivity lost, not deleting files from Google Drive..."
						);
						let id;
						this.settings.filesList.map((file, index) => {
							if (file.name == e.path) {
								id = file.id;
							}
						});
						this.pendingSyncItems.push({
							fileID: id,
							action: "DELETE",
							timeStamp: new Date().toString(),
						});
						this.renamedWhileOffline.delete(e.path);
						if (id) this.finalNamesForFileID.delete(id);
						await this.writeToPendingSyncFile();
						return;
					}
					if (this.settings.refresh) return;
					var id;
					this.settings.filesList.map((file) => {
						if (file.name == e.path) {
							id = file.id;
						}
					});
					this.deletingList.push(e.path);

					var successful = await deleteFile(
						this.settings.accessToken,
						id
					);
					if (successful) new Notice("File deleted!"); // only when actual file from the drive was deleted

					this.deletingList.splice(
						this.deletingList.indexOf(e.path),
						1
					);

					this.refreshFilesListInDriveAndStoreInSettings()
				} catch (err) {
					this.notifyError();
					this.checkForConnectivity();
					this.deletingList = [];
				}
			})
		);
		this.registerEvent(
			this.app.vault.on("modify", async (e) => {
				if (e.path == "pendingSync-gdrive-plugin") {
					return;
				}
				if (this.completingPendingSync) {
					return;
				}
				try {
					if (!this.connectedToInternet) {
						console.log(
							"ERROR: Connectivity lost, not modifying files on Google Drive..."
						);
						if (!this.cloudFiles.length) {
							console.log(
								"FATAL ERROR: Nothing in cloudFiles...."
							);
							return;
						}
						if (
							!this.cloudFiles.includes(e.path) &&
							!this.renamedWhileOffline.get(e.path)
						) {
							if (e instanceof TFile) {
								let id = randomUUID();
								this.pendingSyncItems.push({
									newFileName: e.path,
									action: "UPLOAD",
									timeStamp: new Date().toString(),
									fileID: id,
								});
								this.renamedWhileOffline.set(e.path, id);
								this.finalNamesForFileID.set(id, e.path);
							}
						} else {
							let id;
							if (this.renamedWhileOffline.get(e.path)) {
								id = this.renamedWhileOffline.get(e.path);
							} else {
								this.settings.filesList.map((file, index) => {
									if (file.name == e.path) {
										id = file.id;
									}
								});
							}
							let lastItemOnPendingSync =
								this.pendingSyncItems[
									this.pendingSyncItems.length - 1
								];
							if (
								lastItemOnPendingSync?.fileID == id &&
								lastItemOnPendingSync?.action == "MODIFY"
							) {
								this.pendingSyncItems.pop();
							}

							this.pendingSyncItems.push({
								fileID: id,
								action: "MODIFY",
								timeStamp: new Date().toString(),
							});
						}
						await this.writeToPendingSyncFile();
						return;
					}
					if (!this.cloudFiles.includes(e.path)) {
						if (e instanceof TFile) {
							this.uploadNewNotesFile(e);
						}
						return;
					}
					this.syncQueue = true;

					if (
						!(e instanceof TFile) ||
						this.writingFile ||
						e.extension != "md"
					) {
						return;
					}
					if (this.timer) {
						clearTimeout(this.timer);
					}
					this.timer = setTimeout(async () => {
						//console.log("UPDATING FILE");
						this.statusBarItem.classList.replace(
							"sync_icon_still",
							"sync_icon"
						);
						setIcon(this.statusBarItem, "sync");

						this.writingFile = true;

						await this.updateLastSyncMetaTag(e);

						var id;
						this.settings.filesList.map((file: any) => {
							if (file.name == e.path) {
								id = file.id;
							}
						});
						var buffer = await this.app.vault.readBinary(e);
						while (this.syncQueue) {
							var res = await modifyFile(
								this.settings.accessToken,
								id,
								buffer
							);
							//console.log("refreshed!");
							this.syncQueue = false;
						}

						this.writingFile = false;
						this.timer = null;
						this.statusBarItem.classList.replace(
							"sync_icon",
							"sync_icon_still"
						);
						setIcon(this.statusBarItem, "checkmark");
					}, 2250);
				} catch (err) {
					this.notifyError();
					this.checkForConnectivity();
					this.syncQueue = false;
					this.writingFile = false;
					this.timer = null;
				}
			})
		);
		this.registerEvent(
			this.app.workspace.on("file-open", async (file) => {
				if (file?.extension == "md") this.getLatestContent(file!);
			})
		);

		// This creates an icon in the left ribbon.
		const uploadEl = this.addRibbonIcon(
			"cloud",
			"Upload Current File",
			async () => {
				if (!this.connectedToInternet) {
					console.log(
						"ERROR: Connectivity lost, not uploading files to Google Drive..."
					);
					new Notice("ERROR: No connectivity!");
					return;
				}
				var file = this.app.workspace.getActiveFile()!;
				if (!this.cloudFiles.includes(file?.path!)) {
					new ConfirmUpload(this.app, async () => {
						// Called when the user clicks the icon.
						this.uploadNewNotesFile(file);
					}).open();
					return;
				}
				try {
					// Called when the user clicks the icon.
					new Notice("Uploading the current file to Google Drive!");
					var buffer: any = await this.app.vault.readBinary(
						this.app.workspace.getActiveFile()!
					);
					var id;
					this.settings.filesList.map((file: any) => {
						if (
							file.name ==
							this.app.workspace.getActiveFile()?.path
						) {
							id = file.id;
						}
					});
					var res = await modifyFile(
						this.settings.accessToken,
						id,
						buffer
					);
					new Notice("Uploaded!");
				} catch (err) {
					this.notifyError();
					this.checkForConnectivity();
				}
			}
		);
		const downloadEl = this.addRibbonIcon(
			"install",
			"Download Current File",
			async () => {
				if (!this.connectedToInternet) {
					console.log(
						"ERROR: Connectivity lost, not fetching files from Google Drive..."
					);
					new Notice("ERROR: No connectivity!");
					return;
				}
				var ufile = this.app.workspace.getActiveFile()!;
				if (!this.cloudFiles.includes(ufile?.path!)) {
					new Notice(
						"This file doesn't exist on Google Drive. Please upload it first."
					);
					return;
				}
				// Called when the user clicks the icon.
				new Notice("Downloading current file!");
				await this.getLatestContent(ufile, "forced");
				new Notice("Sync complete :)");
			}
		);

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: "drive-upload-current",
			name: "Upload current file to Google Drive",
			callback: async () => {
				if (!this.connectedToInternet) {
					console.log(
						"ERROR: Connectivity lost, not uploading files to Google Drive..."
					);
					new Notice("ERROR: No connectivity!");
					return;
				}
				var file = this.app.workspace.getActiveFile()!;
				if (!this.cloudFiles.includes(file?.path!)) {
					new ConfirmUpload(this.app, async () => {
						// Called when the user clicks the icon.
						this.uploadNewNotesFile(file);
					}).open();
					return;
				}
				try {
					// Called when the user clicks the icon.
					new Notice("Uploading the current file to Google Drive!");
					var buffer: any = await this.app.vault.readBinary(
						this.app.workspace.getActiveFile()!
					);
					var id;
					this.settings.filesList.map((file: any) => {
						if (
							file.name ==
							this.app.workspace.getActiveFile()?.path
						) {
							id = file.id;
						}
					});
					var res = await modifyFile(
						this.settings.accessToken,
						id,
						buffer
					);
					new Notice("Uploaded!");
				} catch (err) {
					this.notifyError();
					this.checkForConnectivity();
				}
			},
		});
		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: "drive-download-current",
			name: "Download current file from Google Drive",
			callback: async () => {
				if (!this.connectedToInternet) {
					console.log(
						"ERROR: Connectivity lost, not fetching files from Google Drive..."
					);
					new Notice("ERROR: No connectivity!");
					return;
				}
				var ufile = this.app.workspace.getActiveFile()!;
				if (!this.cloudFiles.includes(ufile?.path!)) {
					new Notice(
						"This file doesn't exist on Google Drive. Please upload it first."
					);
					return;
				}
				// Called when the user clicks the icon.
				new Notice("Downloading current file!");
				await this.getLatestContent(ufile, "forced");
				new Notice("Sync complete :)");
			},
		});
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class syncSettings extends PluginSettingTab {
	plugin: driveSyncPlugin;

	constructor(app: App, plugin: driveSyncPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		/* header */
		const head = containerEl.createEl("h1", {
			// heading
			text: "Google Drive Sync",
			cls: "main",
		});

		const sync = containerEl.createEl("div", { cls: "container" });

		if (this.plugin.settings.validToken) {
			// if token is valid
			const sync_text = sync.createEl("div", {
				text: "Logged in",
				cls: "sync_text",
			});
			const sync_icons = sync.createDiv({ cls: "sync_icon_still" });
			setIcon(sync_icons, "checkmark");
		} else {
			// display login link
			const sync_link = sync.createEl("a", {
				text: "Open this link to log in",
				cls: "sync_text",
			});
			sync_link.href =
				"https://red-formula-303406.ue.r.appspot.com/auth/obsidian";
		}

		/* set refresh token input box */
		new Setting(containerEl)
			.setName("Set refresh token")
			.setDesc("Enter the refresh token you got from the link provided")
			.addText((text) =>
				text
					.setPlaceholder("Enter token")
					.setValue(this.plugin.settings.refreshToken)
					.onChange(async (value) => {
						this.plugin.settings.refreshToken = value;
					})
			)
			.addButton((button) =>
				button.setIcon("checkmark").onClick(async () => {
					await this.plugin.saveSettings(); // save refresh token

					sync.innerHTML = "";
					const sync_text = sync.createEl("div", {
						text: "Checking...",
						cls: "sync_text",
					});
					const sync_icons = sync.createDiv({ cls: "sync_icon" });
					setIcon(sync_icons, "sync");
					var res: any = await getAccessToken(
						this.plugin.settings.refreshToken
					); // check for accesstoken
					if (res != "error") {
						// display status accordingly
						this.plugin.settings.accessToken = res.access_token;
						this.plugin.settings.validToken = true;
						new Notice("Logged in successfully");
						sync.innerHTML = "";
						const sync_text = sync.createEl("div", {
							text: "Logged in",
							cls: "sync_text",
						});
						const sync_icons = sync.createDiv({
							cls: "sync_icon_still",
						});
						setIcon(sync_icons, "checkmark");
						new Notice("Please reload the plug-in", 5000);
					} else {
						this.plugin.settings.accessToken = "";
						this.plugin.settings.validToken = false;
						new Notice("Log in failed");
						sync.innerHTML = "";
						const sync_link = sync.createEl("a", {
							text: "Open this link to log in",
							cls: "sync_text",
						});
						sync_link.href =
							"https://red-formula-303406.ue.r.appspot.com/auth/obsidian";
					}
				})
			);
		if (!this.plugin.settings.validToken) return; // bodge 1
		if (!this.plugin.settings.vaultInit) {
			new Setting(containerEl)
				.setName("Initialize vault")
				.setDesc("Create vault and sync all files to Google Drive")
				.addButton((button) => {
					button.setButtonText("Proceed");
					button.onClick(
						async () => await this.plugin.cleanInstall()
					);
				});
			return;
		}
		new Setting(containerEl)
			.setName("Set refresh time")
			.setDesc(
				"Enter the time in seconds after which the plugin checks for changed content. [Reload required]"
			)
			.addText((text) =>
				text
					.setPlaceholder("Enter time")
					.setValue(this.plugin.settings.refreshTime)
					.onChange(async (value) => {
						this.plugin.settings.refreshTime = value;
					})
			);
		new Setting(containerEl)
			.setName("Auto refresh binary files")
			.setDesc(
				"Experimental: Automatically fetch lastest binary files. Currently this plugin doesn't completely support binary file sync."
			)
			.addDropdown((selector) => {
				selector.addOption("1", "Fetch");
				selector.addOption("0", "Don't fetch");
				selector.setValue(this.plugin.settings.autoRefreshBinaryFiles);
				selector.onChange((val) => {
					this.plugin.settings.autoRefreshBinaryFiles = val;
				});
			});
		new Setting(containerEl)
			.setName("Upload all")
			.setDesc(
				"Upload all files to Google Drive, thus DELETING ALL PREVIOUS FILES"
			)
			.addButton((button) =>
				button.setIcon("cloud").onClick(async () => {
					new Notice("Clearing vault in Google Drive...");
					await deleteFile(
						this.plugin.settings.accessToken,
						this.plugin.settings.vaultId
					);
					await this.plugin.cleanInstall();
				})
			);
		new Setting(containerEl)
			.setName("Download all")
			.setDesc(
				"Download all files from Google Drive, thus DELETING ALL PREVIOUS FILES"
			)
			.addButton((button) =>
				button.setIcon("install").onClick(async () => {
					new Notice("Clearing vault...");
					var filesList = this.app.vault.getFiles();
					this.plugin.settings.refresh = true;
					for (const file of filesList) {
						this.app.vault.delete(file, true);
					}
					new Notice("Downloading files...");
					for (const file of this.plugin.settings.filesList) {
						//console.log(file);

						var res = await getFile(
							this.plugin.settings.accessToken,
							file.id
						);
						await this.app.vault
							.createBinary(res[0], res[1])
							.catch(async () => {
								var path = res[0]
									.split("/")
									.slice(0, -1)
									.join("/");
								//console.log(path);

								await this.app.vault.createFolder(path);
								await this.app.vault.createBinary(
									res[0],
									res[1]
								);
							});
					}
					this.plugin.settings.refresh = false;
					new Notice("Sync complete :)");
				})
			);
	}
}

export class ConfirmUpload extends Modal {
	onSubmit: () => void;

	constructor(app: App, onSubmit: () => void) {
		super(app);
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;

		contentEl.createEl("h2", { text: "Wait a sec!" });

		new Setting(contentEl).setName(
			"Seems like this file is missing from Google Drive. Either it has been created recently or was deleted from your other devices. You can upload it to Google Drive or manually delete it :)"
		);

		new Setting(contentEl)
			.addButton((btn) =>
				btn.setButtonText("Okay").onClick(() => {
					this.close();
				})
			)
			.addButton((btn) =>
				btn
					.setButtonText("Upload")
					.setCta()
					.onClick(() => {
						//console.log(this.app.workspace.getActiveFile());
						this.close();
						this.onSubmit();
					})
			);
	}

	onClose() {
		let { contentEl } = this;
		contentEl.empty();
	}
}
