import { getFileHash } from "../src/sync";
import { promises as fs } from "fs";

test("getFileHash generates consistent hashes", async () => {
    const testFilePath = "./test-file.txt";
    await fs.writeFile(testFilePath, "test content");

    const hash1 = await getFileHash(testFilePath);
    const hash2 = await getFileHash(testFilePath);

    expect(hash1).toBe(hash2);

    await fs.unlink(testFilePath); // Clean up
});