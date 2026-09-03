import { Decrypter, Encrypter } from "age-encryption";

export const AGE_SCRYPT_WORK_FACTOR = 14;

export async function encryptWithPassphrase(
  plaintext: Uint8Array | string,
  passphrase: string
): Promise<Uint8Array> {
  const encrypter = new Encrypter();
  encrypter.setScryptWorkFactor(AGE_SCRYPT_WORK_FACTOR);
  encrypter.setPassphrase(passphrase);
  const ciphertext = await encrypter.encrypt(plaintext);
  return new Uint8Array(ciphertext);
}

export async function decryptWithPassphrase(
  ciphertext: Uint8Array,
  passphrase: string
): Promise<Uint8Array> {
  const decrypter = new Decrypter();
  decrypter.addPassphrase(passphrase);
  const plaintext = await decrypter.decrypt(ciphertext);
  return new Uint8Array(plaintext);
}
