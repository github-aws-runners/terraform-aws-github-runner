import { KMS } from 'aws-sdk';
import AWS from 'aws-sdk';

AWS.config.update({
  region: process.env.AWS_REGION,
});

const kms = new KMS();

export async function decrypt(encrypted: string, key: string, environmentName: string): Promise<string | undefined> {
  let result: string | undefined = encrypted;
  if (key != undefined) {
    const decrypted = await kms
      .decrypt({
        CiphertextBlob: Buffer.from(encrypted, 'base64'),
        KeyId: key,
        EncryptionContext: {
          ['Environment']: environmentName,
        },
      })
      .promise();
    result = decrypted.Plaintext?.toString();
  }
  return result;
}
