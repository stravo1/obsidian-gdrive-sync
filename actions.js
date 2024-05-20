import { requestUrl } from "obsidian";

const newError = (actionName, err) => {
	return new Error(`ERROR: Unable to complete action: - ${actionName} => ${err.name} - ${err.message} - ${err.stack}`)
}

const getVaultId = async (accessToken, vault, root = null) => {
	try {
		const response = await requestUrl({
			url:
				"https://www.googleapis.com/drive/v3/files?q=mimeType%20%3D%20'application%2Fvnd.google-apps.folder'" +
				(root != null ? `%20and%20'${root}'%20in%20parents` : ""),
			method: "GET",
			headers: {
				Authorization: `Bearer ${accessToken}`,
				Accept: "application/json",
			},
		}).catch((e) => console.log(e));
		const list = response.json.files;
		var vaultFolder = list.filter((file) => file.name == vault);
		var vaultId = vaultFolder.length ? vaultFolder[0].id : "NOT FOUND";
		return vaultId;
	} catch (err) {
		console.log(err);
		throw newError("getVaultId", err);

	}
};

const uploadFile = async (
	accessToken,
	fileName,
	buffer = null,
	parentId = null
) => {
	try {
		const response = await requestUrl({
			url: "https://www.googleapis.com/drive/v3/files?uploadType=multipart",
			method: "POST",
			headers: {
				Authorization: `Bearer ${accessToken}`,
				Accept: "application/json",
			},
			contentType: "application/json",
			body: JSON.stringify({
				//mimeType: "text/pain",
				name: fileName,
				parents: parentId ? [parentId] : [],
			}),
		}).catch((e) => console.log(e));
		var id = response.json.id;
		if (buffer) {
			// upload the metadata
			await requestUrl({
				url: `https://www.googleapis.com/upload/drive/v3/files/${id}`,
				method: "PATCH",
				headers: {
					Authorization: `Bearer ${accessToken}`,
					Accept: "application/json",
				},
				contentType: "application/json",
				body: buffer,
			}).catch((e) => console.log(e));
		}
		return id;
	} catch (err) {
		console.log(err);
		throw newError("uploadFile", err);

	}
};

const modifyFile = async (accessToken, fileId, buffer) => {
	try {
		var res = await requestUrl({
			url: `https://www.googleapis.com/upload/drive/v3/files/${fileId}`,
			method: "PATCH",
			headers: {
				Authorization: `Bearer ${accessToken}`,
				Accept: "application/json",
			},
			contentType: "application/json",
			body: buffer,
		}).catch((e) => console.log(e));
		return res;
	} catch (err) {
		console.log(err);
		throw newError("modifyFile", err);

	}
};
const renameFile = async (accessToken, fileId, newName) => {
	try {
		const response = await requestUrl({
			url: `https://www.googleapis.com/drive/v3/files/${fileId}`,
			method: "PATCH",
			headers: {
				Authorization: `Bearer ${accessToken}`,
				Accept: "application/json",
			},
			contentType: "application/json",
			body: JSON.stringify({
				name: newName,
			}),
		}).catch((e) => console.log(e));
		var id = response.json.id;
		return id;
	} catch (err) {
		console.log(err);
		throw newError("renameFile", err)

	}
};

const deleteFile = async (accessToken, fileId) => {
	try {
		const response = await requestUrl({
			url: `https://www.googleapis.com/drive/v3/files/${fileId}`,
			method: "DELETE",
			headers: {
				Authorization: `Bearer ${accessToken}`,
				Accept: "application/json",
			},
			contentType: "application/json",
		})
		if (response.status == 404) {
			return false;
		} else {
			return true;
		}
	} catch (err) {
		if (err.status == 404) {
			return false
		}
		console.log(err);
		throw newError("deleteFile", err);
	}
};

const uploadFolder = async (accessToken, foldername, rootId = null) => {
	try {
		const response = await requestUrl({
			url: "https://www.googleapis.com/drive/v3/files?uploadType=multipart",
			method: "POST",
			headers: {
				Authorization: `Bearer ${accessToken}`,
				Accept: "application/json",
			},
			contentType: "application/json",
			body: JSON.stringify({
				mimeType: "application/vnd.google-apps.folder",
				name: foldername,
				parents: rootId ? [rootId] : [],
			}),
		}).catch((e) => console.log(e));

		var id = response.json.id;
		return id;
	} catch (err) {
		console.log(err);
		throw newError("uploadFolder", err);
	}
};

const getFilesList = async (accessToken, vault) => {
	try {
		const response = await requestUrl({
			url:
				"https://www.googleapis.com/drive/v3/files" +
				(vault != null
					? `?q='${vault}'%20in%20parents&fields=files(name%2CmodifiedTime%2CmimeType%2Cid)&pageSize=1000`
					: ""),
			method: "GET",
			headers: {
				Authorization: `Bearer ${accessToken}`,
				Accept: "application/json",
			},
			contentType: "application/json",
		});
		let files = response.json.files;
		let isNextPageAvailable = response.json.nextPageToken ? true : false;
		let nextPageToken = response.json.nextPageToken;
		while (isNextPageAvailable) {
			const response = await requestUrl({
				url:
					"https://www.googleapis.com/drive/v3/files" +
					(vault != null
						? `?q='${vault}'%20in%20parents&fields=files(name%2CmodifiedTime%2CmimeType%2Cid)&pageSize=1000`
						: "") +
					`&pageToken=${nextPageToken}`,
				method: "GET",
				headers: {
					Authorization: `Bearer ${accessToken}`,
					Accept: "application/json",
				},
				contentType: "application/json",
			});
			files = files.concat(response.json.files);
			isNextPageAvailable = response.json.nextPageToken ? true : false;
			nextPageToken = response.json.nextPageToken;
		}
		return files;
	} catch (err) {
		console.log(err);
		throw newError("getFilesList", err);
	}
};

const getFoldersList = async (accessToken, vault = null) => {
	try {
		const response = await requestUrl({
			url:
				"https://www.googleapis.com/drive/v3/files?q=mimeType%3D%27application%2Fvnd.google-apps.folder%27" +
				(vault != null ? `%20and%20'${vault}'%20in%20parents` : "") + "&fields=files(name%2Cid)&orderBy=createdTime&pageSize=1000",
			method: "GET",
			headers: {
				Authorization: `Bearer ${accessToken}`,
				Accept: "application/json",
			},
		});
		let folders = response.json.files;
		console.log(folders);
		let isNextPageAvailable = response.json.nextPageToken ? true : false;
		let nextPageToken = response.json.nextPageToken;
		while (isNextPageAvailable) {
			const response = await requestUrl({
				url:
					"https://www.googleapis.com/drive/v3/files?q=mimeType%3D%27application%2Fvnd.google-apps.folder%27" +
					(vault != null ? `%20and%20'${vault}'%20in%20parents` : "") + "&fields=files(name%2Cid)&orderBy=createdTime&pageSize=1000" +
					`&pageToken=${nextPageToken}`,
				method: "GET",
				headers: {
					Authorization: `Bearer ${accessToken}`,
				},
			});
			folders = folders.concat(response.json.files);
			isNextPageAvailable = response.json.nextPageToken ? true : false;
			nextPageToken = response.json.nextPageToken;
		}
		return folders;
	} catch (err) {
		console.log(err);
		throw newError("getFoldersList", err);
	}
};
const getFile = async (accessToken, fileId) => {
	try {
		const responseBuffer = await requestUrl({
			url:
				"https://www.googleapis.com/drive/v3/files/" +
				fileId +
				"?alt=media",

			method: "GET",
			headers: {
				Authorization: `Bearer ${accessToken}`,
			},
		});
		const responseName = await requestUrl({
			url: "https://www.googleapis.com/drive/v3/files/" + fileId,
			method: "GET",
			headers: {
				Authorization: `Bearer ${accessToken}`,
			},
		});
		return [responseName.json.name, responseBuffer.arrayBuffer];
	} catch (err) {
		console.log(err);
		throw newError("getFile", err);
	}
};

const getFileInfo = async (accessToken, id) => {
	try {
		const response = await requestUrl({
			url:
				`https://www.googleapis.com/drive/v3/files/${id}?fields=modifiedTime%2Cname%2Cid%2CmimeType`
			,
			method: "GET",
			headers: {
				Authorization: `Bearer ${accessToken}`,
				Accept: "application/json",
			},
		});
		return response;
	} catch (err) {
		console.log(err);
		throw newError("getFileInfo", err);
	}
};

export {
	getVaultId,
	getFilesList,
	getFoldersList,
	uploadFile,
	uploadFolder,
	getFile,
	renameFile,
	deleteFile,
	modifyFile,
	getFileInfo
};
