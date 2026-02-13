import * as schema from "./schema.js";
export declare const db: import("drizzle-orm/libsql").LibSQLDatabase<typeof schema> & {
    $client: import("@libsql/client").Client;
};
