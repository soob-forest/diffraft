export class OperationGate {
  private busy = false;
  constructor(private notify: (busy: boolean) => void) {}

  assertIdle(): void {
    if (this.busy)
      throw new Error("현재 문서 처리가 끝난 뒤 다시 시도해 주세요.");
  }

  async run<T>(operation: () => Promise<T>): Promise<T> {
    this.assertIdle();
    this.busy = true;
    this.notify(true);
    try {
      return await operation();
    } finally {
      this.busy = false;
      this.notify(false);
    }
  }
}
