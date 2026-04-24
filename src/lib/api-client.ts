/**
 * ApiError — thrown by `unwrap()` in rpc-client.ts on non-2xx responses.
 * Kept here for backwards compatibility with existing catch blocks
 * that check `e instanceof ApiError`.
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    public body: { error: string },
  ) {
    super(body.error);
    this.name = "ApiError";
  }
}
