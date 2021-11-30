class ScaleError extends Error {
  constructor(public message: string) {
    super(message);
    this.name = 'ScaleError';
    this.stack = new Error().stack;
  }
}

export default ScaleError;
