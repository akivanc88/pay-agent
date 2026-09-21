/**
 * Installed-shop records: the Shopify access token and (optionally) the pay-agent Cloud tenant
 * API key linked to that shop. Kept local to this app — a Shopify access token is a credential
 * for that merchant's store, not something the open-source consent core or pay-agent Cloud need
 * to see.
 */
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import Database from "better-sqlite3";

export interface Shop {
  readonly domain: string;
  readonly accessToken: string;
  /** Set once the shop is linked to a pay-agent Cloud tenant — see README's "Not yet built". */
  readonly cloudApiKey: string | null;
  readonly installedAt: string;
}

export interface ShopStore {
  upsertShop(domain: string, accessToken: string): Shop;
  getShop(domain: string): Shop | null;
  setCloudApiKey(domain: string, cloudApiKey: string): void;
  deleteShop(domain: string): void;
  close(): void;
}

export function openShopStore(path: string): ShopStore {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS shops (
      domain TEXT PRIMARY KEY,
      access_token TEXT NOT NULL,
      cloud_api_key TEXT,
      installed_at TEXT NOT NULL
    );
  `);

  function row(domain: string): Shop | null {
    const r = db
      .prepare("SELECT domain, access_token as accessToken, cloud_api_key as cloudApiKey, installed_at as installedAt FROM shops WHERE domain = ?")
      .get(domain) as Shop | undefined;
    return r ?? null;
  }

  return {
    upsertShop(domain: string, accessToken: string) {
      const installedAt = new Date().toISOString();
      db.prepare(
        `INSERT INTO shops (domain, access_token, installed_at) VALUES (?, ?, ?)
         ON CONFLICT(domain) DO UPDATE SET access_token = excluded.access_token`,
      ).run(domain, accessToken, installedAt);
      return row(domain) as Shop;
    },
    getShop(domain: string) {
      return row(domain);
    },
    setCloudApiKey(domain: string, cloudApiKey: string) {
      db.prepare("UPDATE shops SET cloud_api_key = ? WHERE domain = ?").run(cloudApiKey, domain);
    },
    deleteShop(domain: string) {
      db.prepare("DELETE FROM shops WHERE domain = ?").run(domain);
    },
    close() {
      db.close();
    },
  };
}
