import * as sqlite3 from "sqlite3";
import { printer } from "./output";

// Define your data model classes here (similar to the C# classes)

interface HttpRequestDetail {
  TracingId?: number;
  MethodName: string;
  Url: string;
  RequestRaw: string;
  RequestAt: number;
}

interface HttpResponseDetail {
  Error?: string;
  Code?: number;
  ResponseRaw?: string;
  RespondAt?: number;
}

interface HttpDataModel {
  Id?: number;
  Request: HttpRequestDetail;
  Response?: HttpResponseDetail;
}

export class DataRepo {
  private db: sqlite3.Database;
  constructor(private databaseFile: string) {
    const db = (this.db = new sqlite3.Database(databaseFile));
    // Create a table if it doesn't exist
    db.serialize(() => {
      db.run(`
                CREATE TABLE IF NOT EXISTS HttpItems (
                Id INTEGER PRIMARY KEY AUTOINCREMENT,
                Request TEXT,
                Response TEXT
                )
            `);
    });
  }

  public updateDataAsync(id: number, response: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const stmt = this.db.prepare("UPDATE HttpItems SET Response = ? WHERE Id = ?");
      // Bind the values to the placeholders
      stmt.run(response, id, function (err: { message: string }) {
        if (err) {
          reject(err);
          return;
        }
        // Finalize the statement
        stmt.finalize(function (finalizeErr) {
          if (finalizeErr) {
            reject(finalizeErr);
          } else {
            resolve();
          }
        });
      });
    });
  }

  public clearDataAsync(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const stmt = this.db.prepare("DELETE FROM HttpItems");
      // Bind the values to the placeholders
      stmt.run(function (err: { message: string }) {
        if (err) {
          reject(err);
          return;
        }
        // Finalize the statement
        stmt.finalize(function (finalizeErr) {
          if (finalizeErr) {
            reject(finalizeErr);
          } else {
            resolve();
          }
        });
      });
    });
  }

  public insertDataAsync(data: HttpDataModel): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      const stmt = this.db.prepare("INSERT INTO HttpItems (Request, Response) VALUES (?, ?)");
      // Bind the values to the placeholders
      stmt.run(JSON.stringify(data.Request), JSON.stringify(data.Response), function (err: { message: string }) {
        if (err) {
          reject(err);
          return;
        }
        const id = (stmt as sqlite3.RunResult).lastID;
        // Finalize the statement
        stmt.finalize(function (finalizeErr) {
          if (finalizeErr) {
            reject(finalizeErr);
          } else {
            resolve(id);
          }
        });
      });
    });
  }

  // Function to retrieve data from the database
  public getDataAsync(id: number): Promise<HttpDataModel | undefined> {
    return new Promise((resolve, reject) => {
      this.db.get("SELECT * FROM HttpItems WHERE Id = ?", [id], (err, row: { Id: number; Request: string; Response: string }) => {
        if (err) {
          reject(err);
          return;
        }
        if (row) {
          const data: HttpDataModel = {
            Id: row.Id,
            Request: JSON.parse(row.Request),
            Response: row.Response ? JSON.parse(row.Response) : null,
          };
          resolve(data);
        } else {
          resolve(undefined);
        }
      });
    });
  }

  // Function to retrieve data from the database
  public getAsync(count: number): Promise<HttpDataModel[]> {
    return new Promise((resolve, reject) => {
      this.db.all("SELECT * FROM HttpItems ORDER BY ID DESC LIMIT ?", [count], (err, rows: { Id: number; Request: string; Response: string }[]) => {
        if (err) {
          reject(err);
          return;
        }

        if (rows) {
          resolve(rows.map((row) => ({ Id: row.Id, Request: JSON.parse(row.Request), Response: row.Response ? JSON.parse(row.Response) : null })));
        } else {
          resolve([]);
        }
      });
    });
  }

  public dispose() {
    this.db.close((err) => {
      if (err) {
        printer.error(`Error closing the database ${this.databaseFile}: ${err.message}`);
      } else {
        printer.log(`Database ${this.databaseFile} closed.`);
      }
    });
  }
}
