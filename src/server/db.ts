// 会場で再現できるローカル保存。停止はサーバープロセス終了。resetで種データへ復元。
import { DatabaseSync } from "node:sqlite";
import { ingredients, recipes, seedProducts, stores } from "../domain/seed.js";
import type { PriceCapture, Product } from "../domain/types.js";
export class Repository {
  db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(
      "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS captures (id TEXT PRIMARY KEY, body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS meta (id INTEGER PRIMARY KEY CHECK (id=1), revision INTEGER NOT NULL); INSERT OR IGNORE INTO meta VALUES (1,0)",
    );
    if (
      !(
        this.db.prepare("SELECT COUNT(*) AS n FROM products").get() as {
          n: number;
        }
      ).n
    )
      this.reset();
  }
  get revision() {
    return (
      this.db.prepare("SELECT revision FROM meta WHERE id=1").get() as {
        revision: number;
      }
    ).revision;
  }
  products(): Product[] {
    return this.db
      .prepare("SELECT body FROM products ORDER BY id")
      .all()
      .map((r) => JSON.parse(r.body as string));
  }
  capture(id: string): PriceCapture | undefined {
    const row = this.db.prepare("SELECT body FROM captures WHERE id=?").get(id);
    return row ? JSON.parse(row.body as string) : undefined;
  }
  saveCapture(c: PriceCapture) {
    this.db
      .prepare("INSERT OR REPLACE INTO captures VALUES (?,?)")
      .run(c.id, JSON.stringify(c));
  }
  transaction<T>(work: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = work();
      this.db.exec("COMMIT");
      return result;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  confirm(capture: PriceCapture, product: Product) {
    this.transaction(() => {
      this.db
        .prepare("INSERT OR REPLACE INTO products VALUES (?,?)")
        .run(product.id, JSON.stringify(product));
      this.saveCapture(capture);
      this.db.exec("UPDATE meta SET revision=revision+1 WHERE id=1");
    });
  }
  reset() {
    this.transaction(() => {
      this.db.exec(
        "DELETE FROM products; DELETE FROM captures; UPDATE meta SET revision=revision+1 WHERE id=1",
      );
      const insert = this.db.prepare("INSERT INTO products VALUES (?,?)");
      for (const p of seedProducts()) insert.run(p.id, JSON.stringify(p));
    });
  }
  close() {
    this.db.close();
  }
}
export { ingredients, recipes, stores };
