import * as crypto from "crypto";
import * as winston from "winston";

const ENCRYPTION_KEY = crypto.randomBytes(32); // Replace with a securely stored key
const IV_LENGTH = 16;

const logger = winston.createLogger({
    level: "info",
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ level, message, timestamp }) => {
            return `[${timestamp}] ${level.toUpperCase()}: ${message}`;
        })
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: "plugin.log" }),
    ],
});

export function encrypt(text: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv("aes-256-cbc", ENCRYPTION_KEY, iv);
    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");
    const encryptedText = iv.toString("hex") + ":" + encrypted;
    logger.info(`Data encrypted: ${encryptedText}`);
    return encryptedText;
}

export function decrypt(text: string): string {
    const [iv, encrypted] = text.split(":");
    const decipher = crypto.createDecipheriv("aes-256-cbc", ENCRYPTION_KEY, Buffer.from(iv, "hex"));
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    logger.info(`Data decrypted: ${decrypted}`);
    return decrypted;
}