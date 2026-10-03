/**
 * Minimal in-memory stand-in for the Supabase query builder.
 *
 * Unlike a canned-response chain, it keeps real table state, so tests can
 * check the thing that matters for conditional updates: when two requests
 * race, the database lets only one of them win.
 *
 * Each query executes synchronously at its terminal call (`await`, `single()`
 * or `maybeSingle()`), mirroring how a single SQL statement is atomic.
 *
 * Supported: select, update, eq, in, lt, not(col, "is", null), limit, order,
 * single, maybeSingle. Extend as needed.
 */

type Row = Record<string, any>;
type DbError = { message: string; code?: string };
type Op = "select" | "update";

export function createFakeSupabase(tables: Record<string, Row[]>) {
  const forcedErrors: { table: string; op: Op; error: DbError }[] = [];

  class Builder {
    private op: Op = "select";
    private patch: Row = {};
    private filters: Array<(row: Row) => boolean> = [];

    constructor(private readonly table: string) {}

    select(_columns?: string) {
      return this;
    }
    update(patch: Row) {
      this.op = "update";
      this.patch = patch;
      return this;
    }
    eq(column: string, value: unknown) {
      this.filters.push((row) => row[column] === value);
      return this;
    }
    in(column: string, values: unknown[]) {
      this.filters.push((row) => values.includes(row[column]));
      return this;
    }
    lt(column: string, value: string) {
      this.filters.push((row) => row[column] != null && row[column] < value);
      return this;
    }
    not(column: string, operator: string, value: unknown) {
      if (operator === "is" && value === null) {
        this.filters.push((row) => row[column] != null);
        return this;
      }
      throw new Error(`fakeSupabase: unsupported not(${operator})`);
    }
    limit(_count: number) {
      return this;
    }
    order(_column?: string, _opts?: unknown) {
      return this;
    }

    private execute(): { data: Row[] | null; error: DbError | null } {
      const forcedIndex = forcedErrors.findIndex(
        (f) => f.table === this.table && f.op === this.op
      );
      if (forcedIndex >= 0) {
        const [forced] = forcedErrors.splice(forcedIndex, 1);
        return { data: null, error: forced.error };
      }

      const matched = (tables[this.table] ?? []).filter((row) =>
        this.filters.every((filter) => filter(row))
      );

      if (this.op === "update") {
        for (const row of matched) Object.assign(row, this.patch);
      }

      return { data: matched.map((row) => ({ ...row })), error: null };
    }

    single() {
      const { data, error } = this.execute();
      if (error) return Promise.resolve({ data: null, error });
      if (data!.length !== 1) {
        return Promise.resolve({
          data: null,
          error: { code: "PGRST116", message: "expected exactly one row" },
        });
      }
      return Promise.resolve({ data: data![0], error: null });
    }

    maybeSingle() {
      const { data, error } = this.execute();
      if (error) return Promise.resolve({ data: null, error });
      if (data!.length > 1) {
        return Promise.resolve({
          data: null,
          error: { code: "PGRST116", message: "expected at most one row" },
        });
      }
      return Promise.resolve({ data: data![0] ?? null, error: null });
    }

    then<T>(
      onFulfilled?: (value: { data: Row[] | null; error: DbError | null }) => T,
      onRejected?: (reason: unknown) => T
    ) {
      return Promise.resolve(this.execute()).then(onFulfilled, onRejected);
    }
  }

  return {
    tables,
    from: (table: string) => new Builder(table),
    /** Make the next `op` against `table` fail with a database error. */
    failNext(table: string, op: Op, message = "forced database failure") {
      forcedErrors.push({ table, op, error: { message } });
    },
  };
}
