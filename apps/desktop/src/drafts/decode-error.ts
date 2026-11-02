export class DraftDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DraftDecodeError";
  }
}
