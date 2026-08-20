import { createHash } from "node:crypto";

/**
 * Lantu-style MD5 signature: non-empty params sorted by key ASCII ascending,
 * joined as key1=value1&key2=value2, appended with &key=<secret>, MD5 uppercased.
 */
export function signParams(params: Record<string, string>, secret: string): string {
  const stringA = Object.keys(params)
    .filter((key) => params[key] !== "" && params[key] !== undefined)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");

  return createHash("md5").update(`${stringA}&key=${secret}`, "utf8").digest("hex").toUpperCase();
}

export function verifySignature(params: Record<string, string>, secret: string): boolean {
  const sign = params.sign;

  if (!sign) {
    return false;
  }

  const { sign: _sign, ...payload } = params;

  return signParams(payload, secret) === sign.toUpperCase();
}
