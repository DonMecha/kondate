// 会場内だけで使う起動単位の鍵。保存しない。停止はサーバーの終了。
import { randomBytes, timingSafeEqual } from "node:crypto";
import { networkInterfaces } from "node:os";
export interface NetworkConfig {
  host: string;
  key?: string;
  joinUrl: string | null;
}
export function createNetwork(host = "127.0.0.1", port = 3000): NetworkConfig {
  if (host !== "127.0.0.1" && host !== "0.0.0.0")
    throw new Error("HOSTは127.0.0.1または0.0.0.0を指定してください");
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("PORTが不正です");
  if (host === "127.0.0.1")
    return { host, joinUrl: `http://127.0.0.1:${port}/` };
  const key = randomBytes(32).toString("base64url");
  const addresses = Object.values(networkInterfaces())
    .flat()
    .filter((x) => x && x.family === "IPv4" && !x.internal);
  // 複数NIC時は最初のIPv4。会場の到達性は実機で確認する。
  const address = addresses[0]?.address;
  return {
    host,
    key,
    joinUrl: address ? `http://${address}:${port}/?k=${key}` : null,
  };
}
export function keyMatches(
  actual: string | undefined,
  expected: string | undefined,
) {
  if (!expected) return true;
  if (!actual || actual.length !== expected.length) return false;
  const a = Buffer.from(actual),
    b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
export const isLoopback = (address?: string) =>
  address === "127.0.0.1" ||
  address === "::1" ||
  address === "::ffff:127.0.0.1";
