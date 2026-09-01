import "server-only";

import { S3Client } from "@aws-sdk/client-s3";

import { getProfileMediaR2Env } from "@/lib/profile-media/env";

export type ProfileMediaR2Connection = Readonly<{
  client: S3Client;
  bucket: string;
}>;

export function createProfileMediaR2Connection(): ProfileMediaR2Connection {
  const {
    endpoint,
    accessKeyId,
    secretAccessKey,
    bucket,
  } = getProfileMediaR2Env();

  const client = new S3Client({
    region: "auto",
    endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  return {
    client,
    bucket,
  };
}