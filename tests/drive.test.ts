import { uploadFile, downloadFile } from "../src/drive";
import { createReadStream, createWriteStream } from "fs";
import { promises as fs } from "fs";
import { mocked } from "jest-mock";

jest.mock("googleapis", () => ({
    drive_v3: {
        Drive: jest.fn().mockImplementation(() => ({
            files: {
                create: jest.fn().mockResolvedValue({ data: { id: "12345" } }),
                get: jest.fn().mockResolvedValue({ data: createReadStream("./test-file.txt") }),
            },
        })),
    },
}));

test("uploadFile uploads a file", async () => {
    const drive = new (require("googleapis").drive_v3.Drive)();
    const filePath = "./test-file.txt";

    await fs.writeFile(filePath, "test content");
    const response = await uploadFile(filePath, drive);

    expect(response).toBeDefined();
    await fs.unlink(filePath); // Clean up
});