class ScaleError extends Error {
  constructor(
    message: string,
    public readonly failedInstanceCount: number = 1,
  ) {
    super(message);
    this.name = 'ScaleError';
  }

  /**
   * Gets a formatted error message including the failed instance count
   */
  public get detailedMessage(): string {
    return `${this.message} (Failed to create ${this.failedInstanceCount} instance${this.failedInstanceCount !== 1 ? 's' : ''})`;
  }
}

export default ScaleError;