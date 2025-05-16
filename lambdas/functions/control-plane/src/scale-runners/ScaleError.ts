class ScaleError extends Error {
  constructor(
    public message: string,
    public failedInstanceCount: number = 1
  ) {
    super(message);
    this.name = 'ScaleError';
    this.stack = new Error().stack;
  }

  /**
   * Gets a formatted error message including the failed instance count
   */
  public getDetailedMessage(): string {
    return `${this.message} (Failed to create ${this.failedInstanceCount} instance${this.failedInstanceCount !== 1 ? 's' : ''})`;
  }
}

export default ScaleError;
