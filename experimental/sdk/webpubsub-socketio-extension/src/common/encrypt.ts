import crypto from "crypto";

/**
 * A wrapper of `crypto` module to do encryption and decryption conveniently.
 */
export class Crypto {
  private secret_key: Buffer;
  public iv: Buffer;
  private method: string;

  constructor(key: Buffer, iv: Buffer, method: string) {
    this.secret_key = key;
    this.iv = iv;
    this.method = method;
  }

  public encrypt(data: string): string {
    const cipher = crypto.createCipheriv(this.method, this.secret_key, this.iv);
    return Buffer.from(cipher.update(data, "utf8", "hex") + cipher.final("hex")).toString("base64");
  }

  public decrypt(encryptedData: string): string {
    const buff = Buffer.from(encryptedData, "base64");
    const decipher = crypto.createDecipheriv(this.method, this.secret_key, this.iv);
    return decipher.update(buff.toString("utf8"), "hex", "utf8") + decipher.final("utf8");
  }
}

export function getAesCryptor(secret: Buffer, iv: Buffer): Crypto {
  if (!(secret.length === 32 && iv.length === 16)) {
    throw new Error("Secret key must be 256 bits (32 bytes) and iv must be 128 bits (16 bytes). ");
  }
  return new Crypto(secret, iv, "aes-256-cbc");
}

/**
 * Sample Usage:
 *
 * var secret = crypto.randomBytes(32), iv = crypto.randomBytes(16);
 * var aes = new Crypto(secret, iv, "aes-256-cbc");
 *
 * var data = "hello_world"
 * var encrypted_data = aes.encryptData(data);
 * var decrypted_data = aes.decryptData(encrypted_data)
 *
 * console.log(data, encrypted_data, decrypted_data);
 */
