export interface HttpResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

export interface HttpRequest {
  readonly method: string;
  readonly pathname: string;
  readonly query: URLSearchParams;
  /** Lower-cased names; a header sent more than once is joined with `, `. */
  readonly headers: Readonly<Record<string, string>>;
  /** The request body as text. Empty for methods that carry none. */
  readonly body: string;
  /** The peer that opened the socket — the reverse proxy, when there is one. */
  readonly remoteAddress: string | null;
}

export interface HttpRoute {
  /** Methods this route answers. `HEAD` is served from the `GET` body by the server. */
  readonly methods: readonly string[];
  readonly pattern: RegExp;
  /**
   * May answer synchronously. A route that has to wait on something — the
   * Valorant API, say — returns a promise instead, and the server awaits it.
   */
  handle(match: RegExpExecArray, request: HttpRequest): HttpResponse | Promise<HttpResponse>;
}
