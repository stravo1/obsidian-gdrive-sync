import { encrypt, decrypt } from "../src/auth";

test("encrypt and decrypt tokens", () => {
    const token = "test-token";
    const encrypted = encrypt(token);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(token);
});