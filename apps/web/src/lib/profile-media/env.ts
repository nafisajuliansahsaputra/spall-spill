import "server-only";

const R2_S3_ENDPOINT_ENV = "R2_S3_ENDPOINT";
const R2_ACCESS_KEY_ID_ENV = "R2_ACCESS_KEY_ID";
const R2_SECRET_ACCESS_KEY_ENV = "R2_SECRET_ACCESS_KEY";
const R2_PROFILE_BUCKET_ENV = "R2_PROFILE_BUCKET";

export type ProfileMediaR2Env = Readonly<{
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}>;

function requireServerEnv(
  value: string | undefined,
  variableName: string,
): string {
  const normalizedValue = value?.trim();

  if (!normalizedValue) {
    throw new Error(
      `Missing required server environment variable: ${variableName}`,
    );
  }

  return normalizedValue;
}

function validateR2Endpoint(value: string): string {
  let endpoint: URL;

  try {
    endpoint = new URL(value);
  } catch {
    throw new Error(`${R2_S3_ENDPOINT_ENV} must be a valid URL`);
  }

  if (endpoint.protocol !== "https:") {
    throw new Error(`${R2_S3_ENDPOINT_ENV} must use HTTPS`);
  }

  if (
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash
  ) {
    throw new Error(
      `${R2_S3_ENDPOINT_ENV} must not contain credentials, query parameters, or fragments`,
    );
  }

  if (endpoint.pathname !== "/" && endpoint.pathname !== "") {
    throw new Error(
      `${R2_S3_ENDPOINT_ENV} must be the account-level R2 S3 endpoint without a bucket or object path`,
    );
  }

  return endpoint.origin;
}

function validateBucketName(value: string): string {
  if (
    value.includes("/") ||
    value.includes("\\") ||
    /\s/.test(value)
  ) {
    throw new Error(
      `${R2_PROFILE_BUCKET_ENV} must be a bucket name, not a path`,
    );
  }

  return value;
}

export function getProfileMediaR2Env(): ProfileMediaR2Env {
  const endpoint = validateR2Endpoint(
    requireServerEnv(
      process.env.R2_S3_ENDPOINT,
      R2_S3_ENDPOINT_ENV,
    ),
  );

  const accessKeyId = requireServerEnv(
    process.env.R2_ACCESS_KEY_ID,
    R2_ACCESS_KEY_ID_ENV,
  );

  const secretAccessKey = requireServerEnv(
    process.env.R2_SECRET_ACCESS_KEY,
    R2_SECRET_ACCESS_KEY_ENV,
  );

  const bucket = validateBucketName(
    requireServerEnv(
      process.env.R2_PROFILE_BUCKET,
      R2_PROFILE_BUCKET_ENV,
    ),
  );

  return {
    endpoint,
    accessKeyId,
    secretAccessKey,
    bucket,
  };
}