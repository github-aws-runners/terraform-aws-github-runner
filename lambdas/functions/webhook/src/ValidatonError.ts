class ValidationError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public error?: Error,
  ) {
    super(message);
    this.name = 'ValidationError';
    this.stack = error ? error.stack : new Error().stack;
  }
}

export default ValidationError;
