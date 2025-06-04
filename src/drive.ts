import { createReadStream, createWriteStream, statSync } from "fs";
import { drive_v3 } from "googleapis";

export async function uploadFile(filePath: string, drive: drive_v3.Drive) {
    const fileMetadata = { name: "example.txt" };
    const fileSize = statSync(filePath).size;
    let uploadedBytes = 0;

    const media = {
        mimeType: "text/plain",
        body: createReadStream(filePath).on("data", (chunk) => {
            uploadedBytes += chunk.length;
            console.log(`Uploaded ${(uploadedBytes / fileSize) * 100}%`);
        }),
    };

    const response = await drive.files.create({
        requestBody: fileMetadata,
        media: media,
        fields: "id",
    });

    console.log("File uploaded with ID:", response.data.id);

    // Return the response so it can be tested
    return response.data;
}

export async function downloadFile(fileId: string, destinationPath: string, drive: drive_v3.Drive) {
    const dest = createWriteStream(destinationPath);
    const response = await drive.files.get(
        { fileId, alt: "media" },
        { responseType: "stream" }
    );

    let downloadedBytes = 0;
    const totalBytes = parseInt(response.headers["content-length"] || "0", 10);

    response.data.on("data", (chunk) => {
        downloadedBytes += chunk.length;
        console.log(`Downloaded ${(downloadedBytes / totalBytes) * 100}%`);
    });

    response.data.pipe(dest);
    dest.on("finish", () => console.log("File downloaded successfully"));
}