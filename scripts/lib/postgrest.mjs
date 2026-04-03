export class PostgrestClient {
  constructor({ supabaseUrl, serviceRoleKey }) {
    this.supabaseUrl = supabaseUrl.replace(/\/+$/, "");
    this.serviceRoleKey = serviceRoleKey;
  }

  async insert({ schema, table, rows, returning = "representation" }) {
    return this.#request({
      schema,
      table,
      method: "POST",
      query: returning === "minimal" ? {} : { select: "*" },
      rows,
      prefer: [`return=${returning}`],
    });
  }

  async upsert({ schema, table, rows, onConflict = "id", returning = "minimal" }) {
    return this.#request({
      schema,
      table,
      method: "POST",
      query: {
        on_conflict: onConflict,
      },
      rows,
      prefer: ["resolution=merge-duplicates", `return=${returning}`],
    });
  }

  async patch({ schema, table, match, values, returning = "minimal" }) {
    return this.#request({
      schema,
      table,
      method: "PATCH",
      query: {
        ...match,
        ...(returning === "minimal" ? {} : { select: "*" }),
      },
      rows: values,
      prefer: [`return=${returning}`],
    });
  }

  async #request({ schema, table, method, query = {}, rows, prefer = [] }) {
    const url = new URL(`${this.supabaseUrl}/rest/v1/${table}`);
    for (const [key, value] of Object.entries(query)) {
      if (value != null) {
        url.searchParams.set(key, value);
      }
    }

    const response = await fetch(url, {
      method,
      headers: {
        apikey: this.serviceRoleKey,
        authorization: `Bearer ${this.serviceRoleKey}`,
        "accept-profile": schema,
        "content-profile": schema,
        "content-type": "application/json",
        ...(prefer.length > 0 ? { prefer: prefer.join(",") } : {}),
      },
      body: rows == null ? undefined : JSON.stringify(rows),
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(
        `PostgREST ${method} ${schema}.${table} failed (${response.status}): ${text || response.statusText}`,
      );
    }

    if (!text) {
      return null;
    }

    return JSON.parse(text);
  }
}

export function chunkArray(items, chunkSize) {
  const chunks = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}
